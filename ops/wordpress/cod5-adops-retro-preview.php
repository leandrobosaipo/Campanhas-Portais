<?php
/**
 * Plugin Name: Código5 AdOps Retro Preview
 * Version: 1.0.1
 * Description: Permite pré-visualizar home e anúncios em uma data/hora simulada para geração de provas retroativas.
 */

if (!defined('ABSPATH')) {
	exit;
}

if (!function_exists('cod5_adops_preview_parse_datetime')) {
	function cod5_adops_preview_parse_datetime($raw_value) {
		$value = trim((string) $raw_value);
		if ($value === '') {
			return null;
		}

		$timezone = wp_timezone();
		$formats = array(
			DateTimeInterface::ATOM,
			'Y-m-d\TH:i:sP',
			'Y-m-d\TH:i:s',
			'Y-m-d\TH:i',
			'Y-m-d H:i:s',
			'Y-m-d H:i',
			'Y-m-d',
		);

		foreach ($formats as $format) {
			$dt = DateTimeImmutable::createFromFormat($format, $value, $timezone);
			if ($dt instanceof DateTimeImmutable) {
				return $dt;
			}
		}

		try {
			return new DateTimeImmutable($value, $timezone);
		} catch (Throwable $e) {
			return null;
		}
	}
}

if (!function_exists('cod5_adops_preview_local_host')) {
	function cod5_adops_preview_local_host() {
		$host = (string) wp_parse_url(home_url('/'), PHP_URL_HOST);
		return str_ends_with($host, '.test') || str_contains($host, 'localhost');
	}
}

if (!function_exists('cod5_adops_preview_secret')) {
	function cod5_adops_preview_secret() {
		if (defined('ADOPS_PREVIEW_SECRET') && ADOPS_PREVIEW_SECRET) {
			return (string) ADOPS_PREVIEW_SECRET;
		}
		$env = getenv('ADOPS_PREVIEW_SECRET');
		if ($env) {
			return (string) $env;
		}
		$host = (string) wp_parse_url(home_url('/'), PHP_URL_HOST);
		$fallbacks = array(
			'perrenguematogrosso.com' => 'adops-preview-perr-2026-c5',
			'perrenguematogrosso.com.test' => 'adops-preview-perr-2026-c5',
			'omatogrossense.com' => 'adops-preview-omt-2026-c5',
			'omatogrossense.com.test' => 'adops-preview-omt-2026-c5',
			'afolhalivre.com' => 'adops-preview-afl-2026-c5',
			'afolhalivre.com.test' => 'adops-preview-afl-2026-c5',
			'portalnortemt.com' => 'adops-preview-pnmt-2026-c5',
			'portalnortemt.com.test' => 'adops-preview-pnmt-2026-c5',
			'portalpantanalmt.com' => 'adops-preview-ppmt-2026-c5',
			'portalpantanalmt.com.test' => 'adops-preview-ppmt-2026-c5',
			'roonoticias.com' => 'adops-preview-roo-2026-c5',
			'roonoticias.com.test' => 'adops-preview-roo-2026-c5',
		);
		return $fallbacks[$host] ?? '';
	}
}

if (!function_exists('cod5_adops_preview_signature_valid')) {
	function cod5_adops_preview_signature_valid($raw_value, $signature) {
		if (cod5_adops_preview_local_host()) {
			return true;
		}

		$secret = cod5_adops_preview_secret();
		if ($secret === '' || $signature === '') {
			return false;
		}

		$expected = hash_hmac('sha256', (string) $raw_value, $secret);
		return hash_equals($expected, (string) $signature);
	}
}

if (!function_exists('cod5_adops_preview_datetime')) {
	function cod5_adops_preview_datetime() {
		static $preview = null;
		static $loaded = false;

		if ($loaded) {
			return $preview;
		}

		$loaded = true;
		$raw_value = isset($_GET['adops_preview_at']) ? wp_unslash($_GET['adops_preview_at']) : '';
		$signature = isset($_GET['adops_preview_sig']) ? wp_unslash($_GET['adops_preview_sig']) : '';

		if ($raw_value === '' || !cod5_adops_preview_signature_valid($raw_value, $signature)) {
			$preview = null;
			return $preview;
		}

		$preview = cod5_adops_preview_parse_datetime($raw_value);
		return $preview;
	}
}

if (!function_exists('cod5_adops_preview_active')) {
	function cod5_adops_preview_active() {
		return cod5_adops_preview_datetime() instanceof DateTimeImmutable;
	}
}

if (!function_exists('cod5_adops_preview_timestamp')) {
	function cod5_adops_preview_timestamp() {
		$preview = cod5_adops_preview_datetime();
		if ($preview instanceof DateTimeImmutable) {
			return $preview->getTimestamp();
		}
		return current_time('timestamp');
	}
}

if (!function_exists('cod5_adops_preview_current_time')) {
	function cod5_adops_preview_current_time($type = 'timestamp') {
		$preview = cod5_adops_preview_datetime();
		if (!($preview instanceof DateTimeImmutable)) {
			return current_time($type);
		}

		if ($type === 'timestamp') {
			return $preview->getTimestamp();
		}
		if ($type === 'mysql') {
			return $preview->format('Y-m-d H:i:s');
		}
		if ($type === 'c') {
			return $preview->format(DateTimeInterface::ATOM);
		}
		return $preview->format((string) $type);
	}
}

if (!function_exists('cod5_adops_preview_wp_date')) {
	function cod5_adops_preview_wp_date($format) {
		return wp_date($format, cod5_adops_preview_timestamp(), wp_timezone());
	}
}

add_action('pre_get_posts', function (WP_Query $query) {
	if (is_admin() || !$query->is_main_query() && !$query->is_home() && !$query->is_front_page() && !$query->is_category() && !$query->is_archive() && !$query->is_search() && !$query->is_single()) {
		return;
	}

	if (!cod5_adops_preview_active()) {
		return;
	}

	$post_type = $query->get('post_type');
	if ($post_type && $post_type !== 'post') {
		return;
	}

	$preview = cod5_adops_preview_datetime();
	if (!($preview instanceof DateTimeImmutable)) {
		return;
	}

	$query->set('date_query', array(
		array(
			'before' => $preview->format('Y-m-d H:i:s'),
			'inclusive' => true,
			'column' => 'post_date',
		),
	));
}, 20);

add_filter('posts_where', function ($where, WP_Query $query) {
	if (is_admin() || !cod5_adops_preview_active()) {
		return $where;
	}

	global $wpdb;
	$post_type = $query->get('post_type');
	if ($post_type && $post_type !== 'post' && !(is_array($post_type) && in_array('post', $post_type, true))) {
		return $where;
	}

	$preview = cod5_adops_preview_datetime();
	if (!($preview instanceof DateTimeImmutable)) {
		return $where;
	}

	$cutoff = esc_sql($preview->format('Y-m-d H:i:s'));
	if (strpos($where, "{$wpdb->posts}.post_date <=") !== false) {
		return $where;
	}

	return $where . " AND {$wpdb->posts}.post_date <= '{$cutoff}'";
}, 20, 2);
