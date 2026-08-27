#!/usr/bin/env bash
set -euo pipefail

HOST="${HOST:-66.253.112.200}"
PORT="${PORT:-215}"
SSH_USER="${SSH_USER:-facilnam}"
REMOTE_TMP="${REMOTE_TMP:-/home/facilnam/tmp/adops-retro-preview}"
PROJECT_ROOT="${PROJECT_ROOT:-/Users/leandrobosaipo/Projetos/AdOps}"

if [ "$#" -lt 1 ]; then
  echo "Uso: $0 <dominio> [dominio...]"
  exit 1
fi

ssh -p "$PORT" "$SSH_USER@$HOST" "mkdir -p '$REMOTE_TMP'"

scp -P "$PORT" \
  "$PROJECT_ROOT/ops/wordpress/cod5-adops-retro-preview.php" \
  "$PROJECT_ROOT/ops/wordpress/adrotate-adops.php" \
  "$SSH_USER@$HOST:$REMOTE_TMP/" >/dev/null

for domain in "$@"; do
  ssh -p "$PORT" "$SSH_USER@$HOST" "DOMAIN='$domain' REMOTE_TMP='$REMOTE_TMP' bash -s" <<'EOF'
set -euo pipefail

domain="$DOMAIN"
tmp="$REMOTE_TMP"
webroot="/home/facilnam/public_html/${domain}/public_html/web"
theme_root="$webroot/app/themes"
plugin_root="$webroot/app/plugins/adrotate"
mu_root="$webroot/app/mu-plugins"

active_theme="$(php /home/facilnam/wp-cli.phar --allow-root --path="$webroot/wp" theme list --status=active --field=name | tail -n 1)"
theme_path="$theme_root/$active_theme"

mkdir -p "$mu_root"
cp "$tmp/cod5-adops-retro-preview.php" "$mu_root/cod5-adops-retro-preview.php"
cp "$tmp/adrotate-adops.php" "$plugin_root/adrotate-adops.php"

python3 - "$theme_path" "$plugin_root" <<'PY'
from pathlib import Path
import re
import sys

theme_path = Path(sys.argv[1])
plugin_root = Path(sys.argv[2])

adrotate_php = plugin_root / "adrotate.php"
adrotate_functions = plugin_root / "adrotate-functions.php"
adrotate_output = plugin_root / "adrotate-output.php"

text = adrotate_php.read_text()
if "adrotate-adops.php" not in text:
    text = text.replace("include_once($adrotate_path.'/adrotate-widget.php');\n", "include_once($adrotate_path.'/adrotate-widget.php');\ninclude_once($adrotate_path.'/adrotate-adops.php');\n")
    adrotate_php.write_text(text)

for file_path in (adrotate_functions, adrotate_output):
    text = file_path.read_text()
    text = text.replace("current_time('timestamp')", "function_exists('adrotate_adops_now') ? adrotate_adops_now() : current_time('timestamp')")
    text = re.sub(
        r"function_exists\('adrotate_adops_now'\)\s*\?\s*adrotate_adops_now\(\)\s*:\s*function_exists\('adrotate_adops_now'\)\s*\?\s*adrotate_adops_now\(\)\s*:\s*current_time\('timestamp'\)",
        "function_exists('adrotate_adops_now') ? adrotate_adops_now() : current_time('timestamp')",
        text,
    )
    text = text.replace("AND `{$wpdb->prefix}adrotate`.`id` = `{$wpdb->prefix}adrotate_linkmeta`.`ad`\n", "AND `{$wpdb->prefix}adrotate`.`id` = `{$wpdb->prefix}adrotate_linkmeta`.`ad`\n\t\t\t\t\tAND `{$wpdb->prefix}adrotate`.`fallback_model` != 1\n")
    text = text.replace("AND `{$wpdb->prefix}adrotate`.`id` = `{$wpdb->prefix}adrotate_linkmeta`.`ad`\n\t\t\tAND (`{$wpdb->prefix}adrotate`.`type` = 'active'", "AND `{$wpdb->prefix}adrotate`.`id` = `{$wpdb->prefix}adrotate_linkmeta`.`ad`\n\t\t\tAND `{$wpdb->prefix}adrotate`.`fallback_model` != 1\n\t\t\tAND (`{$wpdb->prefix}adrotate`.`type` = 'active'")

    group_marker = """if(is_array($group) && !empty($group)) {
\t\t\t// Get all ads in all selected groups - use prepare with IN clause
\t\t\t$query = "SELECT"""
    group_replacement = """if(is_array($group) && !empty($group)) {
\t\t\t$group_type_condition = "(`{$wpdb->prefix}adrotate`.`type` = 'active'
\t\t\t\t\tOR `{$wpdb->prefix}adrotate`.`type` = '2days'
\t\t\t\t\tOR `{$wpdb->prefix}adrotate`.`type` = '7days')";
\t\t\tif(function_exists('cod5_adops_preview_active') && cod5_adops_preview_active()) {
\t\t\t\t$group_type_condition = "(".$group_type_condition." OR `{$wpdb->prefix}adrotate`.`type` = 'expired')";
\t\t\t}
\n\t\t\t$single_type_condition = "`type` = 'active'";
\t\t\tif(function_exists('cod5_adops_preview_active') && cod5_adops_preview_active()) {
\t\t\t\t$single_type_condition = "(`type` = 'active' OR `type` = 'expired')";
\t\t\t}
\n\t\t\t// Get all ads in all selected groups - use prepare with IN clause
\t\t\t$query = "SELECT"""
    if group_marker in text and "$group_type_condition" not in text:
        text = text.replace(group_marker, group_replacement, 1)

    post_inject_marker = """\t// Grab settings to use from first group
\t$group = $wpdb->get_row($wpdb->prepare("SELECT `id`, `wrapper_before`, `wrapper_after` FROM `{$wpdb->prefix}adrotate_groups` WHERE `name` != '' AND `id` = %d;", $group_id), ARRAY_A);
\n\t// Get all ads in group"""
    post_inject_replacement = """\t// Grab settings to use from first group
\t$group = $wpdb->get_row($wpdb->prepare("SELECT `id`, `wrapper_before`, `wrapper_after` FROM `{$wpdb->prefix}adrotate_groups` WHERE `name` != '' AND `id` = %d;", $group_id), ARRAY_A);
\n\t$group_type_condition = "(`{$wpdb->prefix}adrotate`.`type` = 'active'
\t\t\tOR `{$wpdb->prefix}adrotate`.`type` = '2days'
\t\t\tOR `{$wpdb->prefix}adrotate`.`type` = '7days')";
\tif(function_exists('cod5_adops_preview_active') && cod5_adops_preview_active()) {
\t\t$group_type_condition = "(".$group_type_condition." OR `{$wpdb->prefix}adrotate`.`type` = 'expired')";
\t}
\n\t$single_type_condition = "`type` = 'active'";
\tif(function_exists('cod5_adops_preview_active') && cod5_adops_preview_active()) {
\t\t$single_type_condition = "(`type` = 'active' OR `type` = 'expired')";
\t}
\n\t// Get all ads in group"""
    if post_inject_marker in text and text.count("$group_type_condition") < 2:
        text = text.replace(post_inject_marker, post_inject_replacement, 1)

    text = text.replace("AND (`{$wpdb->prefix}adrotate`.`type` = 'active'\n\t\t\t\t\tOR `{$wpdb->prefix}adrotate`.`type` = '2days'\n\t\t\t\t\tOR `{$wpdb->prefix}adrotate`.`type` = '7days')", "AND {$group_type_condition}")
    text = text.replace("AND (`{$wpdb->prefix}adrotate`.`type` = 'active'\n\t\t\t\tOR `{$wpdb->prefix}adrotate`.`type` = '2days'\n\t\t\t\tOR `{$wpdb->prefix}adrotate`.`type` = '7days')", "AND {$group_type_condition}")
    text = text.replace("WHERE `id` = %d AND (`type` = 'active' OR ((function_exists('cod5_adops_preview_active') && cod5_adops_preview_active()) AND `type` = 'expired'))", "WHERE `id` = %d AND {$single_type_condition}")
    text = text.replace("WHERE `id` = %d AND `type` = 'active'", "WHERE `id` = %d AND {$single_type_condition}")
    file_path.write_text(text)

header_data = theme_path / "src" / "HeaderData.php"
if header_data.exists():
    text = header_data.read_text()
    if "$now = current_datetime();" in text:
        text = text.replace("$now = current_datetime();", "$preview_iso = function_exists('cod5_adops_preview_current_time') ? cod5_adops_preview_current_time('c') : current_time('c');\n        $now = new DateTimeImmutable($preview_iso, wp_timezone());")
    text = text.replace("$datetime = $now->format('d/m/Y H:i');", "$datetime = $now->format('d/m/Y H:i');")
    text = text.replace("$datetime = $now->format('d/m/Y H:i:s');", "$datetime = $now->format('d/m/Y H:i');")
    text = text.replace("$datetime = $now->format('d/m/Y - H:i');", "$datetime = $now->format('d/m/Y H:i');")
    header_data.write_text(text)

bar_top = theme_path / "template-parts" / "header" / "bar-top.php"
if bar_top.exists():
    text = bar_top.read_text()
    if "$preview_active" not in text:
        text = text.replace("$timezone = $data['timezone'] ?? 'America/Cuiaba';\n", "$timezone = $data['timezone'] ?? 'America/Cuiaba';\n$preview_active = function_exists('cod5_adops_preview_active') && cod5_adops_preview_active();\n")
        text = text.replace("data-tz=\"<?php echo esc_attr($timezone); ?>\"", "data-tz=\"<?php echo esc_attr($timezone); ?>\" data-preview-active=\"<?php echo esc_attr($preview_active ? '1' : '0'); ?>\"")
        old = """  function tick(){
    document.querySelectorAll('time.js-topbar-datetime').forEach(function(el){
      const tz = el.getAttribute('data-tz') || 'America/Cuiaba';
      el.textContent = formatNow(tz);
      try { el.setAttribute('datetime', new Date().toISOString()); } catch(e) {}
    });
  }
  tick();
  const ms = 60000 - (Date.now() % 60000);
  setTimeout(function(){ tick(); setInterval(tick, 60000); }, ms);"""
        new = """  function tick(){
    document.querySelectorAll('time.js-topbar-datetime').forEach(function(el){
      if (el.getAttribute('data-preview-active') === '1') return;
      const tz = el.getAttribute('data-tz') || 'America/Cuiaba';
      el.textContent = formatNow(tz);
      try { el.setAttribute('datetime', new Date().toISOString()); } catch(e) {}
    });
  }
  const hasPreview = Array.from(document.querySelectorAll('time.js-topbar-datetime')).some(function(el){
    return el.getAttribute('data-preview-active') === '1';
  });
  tick();
  if (!hasPreview) {
    const ms = 60000 - (Date.now() % 60000);
    setTimeout(function(){ tick(); setInterval(tick, 60000); }, ms);
  }"""
        text = text.replace(old, new)
        bar_top.write_text(text)

helpers = theme_path / "includes" / "class-helpers.php"
header_datestamp = theme_path / "parts" / "header-datestamp.php"
if helpers.exists():
    text = helpers.read_text()
    text = text.replace("$now = current_time( 'timestamp' );", "$now = function_exists( 'cod5_adops_preview_timestamp' ) ? cod5_adops_preview_timestamp() : current_time( 'timestamp' );")
    text = text.replace("return date_i18n( $format, $now );", "return wp_date( $format, $now, wp_timezone() );")
    helpers.write_text(text)

if header_datestamp.exists():
    if theme_path.name == "omt-theme":
        header_datestamp.write_text("""<?php
/**
 * Template Part: Header Datestamp
 *
 * Carimbo de data e hora no cabeçalho
 *
 * @package OMT_Theme
 * @since 1.0.1
 */
?>
<div class=\"header-datestamp\">
\t<time datetime=\"<?php echo esc_attr( function_exists( 'cod5_adops_preview_current_time' ) ? cod5_adops_preview_current_time( 'c' ) : current_time( 'c' ) ); ?>\">
\t\t<span class=\"header-datestamp-full\"><?php echo esc_html( omt_get_datestamp() ); ?></span>
\t\t<span class=\"header-datestamp-short\"><?php echo esc_html( omt_get_datestamp_short() ); ?></span>
\t</time>
</div>
""")
    else:
        text = header_datestamp.read_text()
        text = text.replace("current_time( 'c' )", "function_exists( 'cod5_adops_preview_current_time' ) ? cod5_adops_preview_current_time( 'c' ) : current_time( 'c' )")
        header_datestamp.write_text(text)
PY

php /home/facilnam/wp-cli.phar --allow-root --path="$webroot/wp" eval 'if(!function_exists("adrotate_finish_upgrade")) { require_once WP_CONTENT_DIR . "/plugins/adrotate/adrotate-setup.php"; } if(!function_exists("adrotate_evaluate_ads") || !function_exists("adrotate_check_schedules")) { require_once WP_CONTENT_DIR . "/plugins/adrotate/adrotate-admin-functions.php"; } adrotate_finish_upgrade(); adrotate_evaluate_ads(); adrotate_check_schedules();'
php /home/facilnam/wp-cli.phar --allow-root --path="$webroot/wp" cache flush
php /home/facilnam/wp-cli.phar --allow-root --path="$webroot/wp" rocket clean --confirm || true
EOF
done
