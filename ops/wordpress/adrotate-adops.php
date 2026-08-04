<?php
/* ------------------------------------------------------------------------------------
*  Copyright notice preserved from upstream plugin.
------------------------------------------------------------------------------------ */

if (!function_exists('adrotate_adops_trim')) {
	function adrotate_adops_trim($value) {
		return trim((string) $value);
	}
}

if (!function_exists('adrotate_adops_format_pi_code')) {
	function adrotate_adops_format_pi_code($value) {
		$pi_code = adrotate_adops_trim($value);
		if ($pi_code === '') {
			return '';
		}
		if (preg_match('/^P\\.?I\\.?\\b/i', $pi_code)) {
			return $pi_code;
		}
		return 'PI ' . $pi_code;
	}
}

if (!function_exists('adrotate_adops_suffix_from_payload')) {
	function adrotate_adops_suffix_from_payload($payload) {
		$parts = array();
		if (!empty($payload['insertion_id'])) {
			$parts[] = 'INS '.$payload['insertion_id'];
		}
		if (!empty($payload['campaign_id'])) {
		$parts[] = 'CAMP '.$payload['campaign_id'];
		}
		if (!empty($payload['pi_code'])) {
			$parts[] = adrotate_adops_format_pi_code($payload['pi_code']);
		}
		if (!empty($payload['external_key'])) {
			$parts[] = adrotate_adops_trim($payload['external_key']);
		}
		if (!empty($payload['media_basename'])) {
			$parts[] = adrotate_adops_trim($payload['media_basename']);
		}
		if (empty($parts)) {
			return '';
		}
		return ' [ADOPS ' . implode(' | ', $parts) . ']';
	}
}

if (!function_exists('adrotate_adops_normalize_title')) {
	function adrotate_adops_normalize_title($base_title, $payload) {
		$base = preg_replace('/\s*\[ADOPS .*?\]\s*$/', '', (string) $base_title);
		$base = trim((string) $base);
		$suffix = adrotate_adops_suffix_from_payload($payload);
		return trim($base . $suffix);
	}
}

if (!function_exists('adrotate_adops_prepare_payload')) {
	function adrotate_adops_prepare_payload($payload) {
		return array(
			'insertion_id' => !empty($payload['insertion_id']) ? (int) $payload['insertion_id'] : null,
			'campaign_id' => !empty($payload['campaign_id']) ? (int) $payload['campaign_id'] : null,
			'pi_code' => !empty($payload['pi_code']) ? sanitize_text_field($payload['pi_code']) : '',
			'external_key' => !empty($payload['external_key']) ? sanitize_text_field($payload['external_key']) : '',
			'media_basename' => !empty($payload['media_basename']) ? sanitize_file_name($payload['media_basename']) : '',
		);
	}
}

if (!function_exists('adrotate_adops_table_columns')) {
	function adrotate_adops_table_columns($table) {
		global $wpdb;
		$rows = $wpdb->get_results("DESCRIBE `{$table}`", ARRAY_A);
		if (!$rows) {
			return array();
		}
		return array_map(static function($row) {
			return $row['Field'];
		}, $rows);
	}
}

if (!function_exists('adrotate_adops_filter_columns')) {
	function adrotate_adops_filter_columns($table, $data) {
		$columns = adrotate_adops_table_columns($table);
		if (empty($columns)) {
			return array();
		}
		return array_intersect_key($data, array_flip($columns));
	}
}

if (!function_exists('adrotate_adops_is_video')) {
	function adrotate_adops_is_video($url) {
		return (bool) preg_match('/\.(mp4|mov|webm)(\?.*)?$/i', (string) $url);
	}
}

if (!function_exists('adrotate_adops_build_bannercode')) {
	function adrotate_adops_build_bannercode($payload) {
		$media_url = adrotate_adops_trim($payload['media_url'] ?? '');
		$link_url = esc_url_raw($payload['link_url'] ?? '');
			$alt = esc_attr(adrotate_adops_trim($payload['title'] ?? 'Publicidade'));
			if (adrotate_adops_is_video($media_url)) {
				$video = '<video controls muted playsinline preload="metadata" style="display:block;width:100%;height:auto;max-width:100%;"><source src="%asset%" type="video/mp4"></video>';
				if ($link_url !== '') {
					return '<a href="'.$link_url.'" target="_blank" rel="noopener noreferrer" aria-label="'.$alt.'">'.$video.'</a>';
				}
				return $video;
		}
		$image = '<img src="%asset%" alt="'.$alt.'" style="display:block;width:100%;height:auto;max-width:100%;" loading="lazy" decoding="async" />';
		if ($link_url !== '') {
			return '<a href="'.$link_url.'" target="_blank" rel="noopener noreferrer">'.$image.'</a>';
		}
		return $image;
	}
}

if (!function_exists('adrotate_adops_read_json_file')) {
	function adrotate_adops_read_json_file($path) {
		if (!$path || !is_readable($path)) {
			\WP_CLI::error('Arquivo JSON de payload não encontrado ou ilegível.');
		}
		$raw = file_get_contents($path);
		$payload = json_decode($raw, true);
		if (!is_array($payload)) {
			\WP_CLI::error('Payload JSON inválido.');
		}
		return $payload;
	}
}

if (!function_exists('adrotate_adops_run_maintenance')) {
	function adrotate_adops_run_maintenance() {
		$cache_steps = array(
			'wp_cache_flush' => array(),
			'rocket_clean_domain' => array(),
			'rocket_clean_minify' => array(),
			'w3tc_flush_all' => array(),
		);
		foreach ($cache_steps as $cache_function => $cache_args) {
			if (!function_exists($cache_function)) {
				continue;
			}
			try {
				call_user_func_array($cache_function, $cache_args);
			} catch (\Throwable $error) {
				if (class_exists('WP_CLI')) {
					\WP_CLI::warning(sprintf('Manutenção de cache %s indisponível: %s', $cache_function, $error->getMessage()));
				}
			}
		}
		if (function_exists('adrotate_finish_upgrade')) {
			adrotate_finish_upgrade();
		}
		if (!function_exists('adrotate_evaluate_ads') || !function_exists('adrotate_check_schedules')) {
			$admin_functions = WP_CONTENT_DIR . '/plugins/adrotate/adrotate-admin-functions.php';
			if (is_readable($admin_functions)) {
				require_once $admin_functions;
			}
		}
		if (function_exists('adrotate_evaluate_ads')) {
			adrotate_evaluate_ads();
		}
		if (function_exists('adrotate_check_schedules')) {
			adrotate_check_schedules();
		}
	}
}

if (!function_exists('adrotate_adops_period_timestamp')) {
	function adrotate_adops_period_timestamp($date, $end_of_day = false) {
		$value = adrotate_adops_trim($date);
		if ($value === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
			return 0;
		}
		$suffix = $end_of_day ? ' 23:59:00' : ' 00:00:00';
		$timestamp = strtotime($value . $suffix);
		return $timestamp ? (int) $timestamp : 0;
	}
}

if (!function_exists('adrotate_adops_publish_payload')) {
	function adrotate_adops_publish_payload($payload, $apply = false) {
		global $wpdb;

		$insertion_id = !empty($payload['insertion_id']) ? (int) $payload['insertion_id'] : 0;
		$campaign_id = !empty($payload['campaign_id']) ? (int) $payload['campaign_id'] : 0;
		$group_id = !empty($payload['group_id']) ? (int) $payload['group_id'] : 0;
		$media_url = esc_url_raw($payload['media_url'] ?? '');
		$title = sanitize_text_field($payload['title'] ?? '');
		$replace_existing = !isset($payload['replace_existing']) || (bool) $payload['replace_existing'];

		if ($insertion_id <= 0 || $campaign_id <= 0 || $group_id <= 0 || $media_url === '') {
			throw new RuntimeException('Payload incompleto: insertion_id, campaign_id, group_id e media_url são obrigatórios.');
		}

		$ad_table = $wpdb->prefix.'adrotate';
		$schedule_table = $wpdb->prefix.'adrotate_schedule';
		$link_table = $wpdb->prefix.'adrotate_linkmeta';
		$prepared_payload = adrotate_adops_prepare_payload(array(
			'insertion_id' => $insertion_id,
			'campaign_id' => $campaign_id,
			'pi_code' => $payload['pi_code'] ?? '',
			'external_key' => $payload['external_key'] ?? ('adops-'.$insertion_id),
			'media_basename' => $payload['media_basename'] ?? basename(parse_url($media_url, PHP_URL_PATH) ?: ''),
		));

		$existing = $wpdb->get_row($wpdb->prepare(
			"SELECT * FROM `{$ad_table}` WHERE `adops_insertion_id` = %d ORDER BY `id` DESC LIMIT 1",
			$insertion_id
		), ARRAY_A);
		if (!$existing && !empty($prepared_payload['external_key'])) {
			$existing = $wpdb->get_row($wpdb->prepare(
				"SELECT * FROM `{$ad_table}` WHERE `adops_external_key` = %s ORDER BY `id` DESC LIMIT 1",
				$prepared_payload['external_key']
			), ARRAY_A);
		}

		$base_title = $title !== '' ? $title : ('AdOps Inserção '.$insertion_id);
		$next_title = adrotate_adops_normalize_title($base_title, $prepared_payload);
		$bannercode = adrotate_adops_build_bannercode(array_merge($payload, array('title' => $next_title)));
		$now = adrotate_adops_now();
		$ad_data = adrotate_adops_filter_columns($ad_table, array(
			'title' => $next_title,
			'bannercode' => $bannercode,
			'image' => $media_url,
			'imagetype' => 'field',
			'type' => 'active',
			'tracker' => 'N',
			'desktop' => 'Y',
			'mobile' => 'Y',
			'autodelete' => 'N',
			'weight' => 6,
			'updated' => $now,
			'thetime' => $now,
			'author' => get_current_user_id(),
			'adops_insertion_id' => $prepared_payload['insertion_id'],
			'adops_campaign_id' => $prepared_payload['campaign_id'],
			'adops_pi_code' => $prepared_payload['pi_code'],
			'adops_external_key' => $prepared_payload['external_key'],
			'adops_media_basename' => $prepared_payload['media_basename'],
			'adops_synced_at' => current_time('timestamp'),
		));

		$preview = array(
			'mode' => $apply ? 'apply' : 'preview',
			'existing_ad_id' => $existing['id'] ?? null,
			'group_id' => $group_id,
			'replace_existing' => $replace_existing,
			'replace_existing_group_links' => $replace_existing,
			'ad_data' => $ad_data,
			'bannercode_contains_asset' => strpos($bannercode, '%asset%') !== false,
			'payload' => array(
				'insertion_id' => $insertion_id,
				'campaign_id' => $campaign_id,
				'media_url' => $media_url,
				'period_start' => $payload['period_start'] ?? null,
				'period_end' => $payload['period_end'] ?? null,
				'slot_selector' => $payload['slot_selector'] ?? null,
			),
		);

		if (!$apply) {
			return $preview;
		}

		if ($existing) {
			$wpdb->update($ad_table, $ad_data, array('id' => (int) $existing['id']));
			$ad_id = (int) $existing['id'];
		} else {
			$wpdb->insert($ad_table, $ad_data);
			$ad_id = (int) $wpdb->insert_id;
		}
		if ($ad_id <= 0) {
			throw new RuntimeException('Falha ao criar ou atualizar anúncio AdRotate.');
		}

			$link_columns = adrotate_adops_table_columns($link_table);
			$schedule_columns = adrotate_adops_table_columns($schedule_table);
			$starttime = adrotate_adops_period_timestamp($payload['period_start'] ?? '', false);
			$stoptime = adrotate_adops_period_timestamp($payload['period_end'] ?? '', true);
			$schedule_id = (int) $wpdb->get_var($wpdb->prepare(
				"SELECT `schedule` FROM `{$link_table}` WHERE `ad` = %d AND `user` = 0 AND `group` = 0 AND `schedule` > 0 ORDER BY `id` DESC LIMIT 1",
				$ad_id
			));
			if ($replace_existing) {
				// Replace only links owned by this AdOps insertion. Other active or
				// scheduled campaigns in the same group must remain intact.
				$wpdb->delete($link_table, array('ad' => $ad_id, 'user' => 0));
			}
			if ($starttime > 0 && $stoptime > 0 && !empty($schedule_columns)) {
			$schedule_data = adrotate_adops_filter_columns($schedule_table, array(
				'name' => 'Schedule for AdOps insertion '.$insertion_id,
				'starttime' => $starttime,
				'stoptime' => $stoptime,
				'maxclicks' => 0,
				'maximpressions' => 0,
				'spread' => 'N',
				'spread_all' => 'N',
				'daystarttime' => '0000',
				'daystoptime' => '0000',
				'day_mon' => 'Y',
				'day_tue' => 'Y',
				'day_wed' => 'Y',
				'day_thu' => 'Y',
				'day_fri' => 'Y',
				'day_sat' => 'Y',
				'day_sun' => 'Y',
				'autodelete' => 'N',
			));
			if ($schedule_id > 0) {
				$wpdb->update($schedule_table, $schedule_data, array('id' => $schedule_id));
			} else {
				$wpdb->insert($schedule_table, $schedule_data);
				$schedule_id = (int) $wpdb->insert_id;
			}
			if ($schedule_id <= 0) {
				throw new RuntimeException('Falha ao criar ou atualizar agenda AdRotate.');
			}
			$wpdb->insert($link_table, adrotate_adops_filter_columns($link_table, array('ad' => $ad_id, 'user' => 0, 'group' => 0, 'schedule' => $schedule_id)));
		}

		if ($schedule_id > 0) {
			$scheduled_group_link = array('ad' => $ad_id, 'user' => 0, 'group' => $group_id, 'schedule' => $schedule_id);
			if (in_array('block', $link_columns, true)) {
				$scheduled_group_link['block'] = 0;
			}
			$existing_scheduled_group_link = $wpdb->get_var($wpdb->prepare(
				"SELECT COUNT(*) FROM `{$link_table}` WHERE `ad` = %d AND `user` = 0 AND `group` = %d AND `schedule` = %d",
				$ad_id,
				$group_id,
				$schedule_id
			));
			if ((int) $existing_scheduled_group_link <= 0) {
				$wpdb->insert($link_table, adrotate_adops_filter_columns($link_table, $scheduled_group_link));
			}
		}

		$link_data = array('ad' => $ad_id, 'user' => 0, 'group' => $group_id);
		if (in_array('block', $link_columns, true)) {
			$link_data['block'] = 0;
		}
		$existing_link = $wpdb->get_var($wpdb->prepare(
			"SELECT COUNT(*) FROM `{$link_table}` WHERE `ad` = %d AND `user` = 0 AND `group` = %d",
			$ad_id,
			$group_id
		));
		if ((int) $existing_link <= 0) {
			$wpdb->insert($link_table, adrotate_adops_filter_columns($link_table, $link_data));
		}

		if (!empty($payload['purge_cache'])) {
			adrotate_adops_run_maintenance();
		}

		return array(
			'ad_id' => $ad_id,
			'group_id' => $group_id,
			'schedule_id' => $schedule_id,
			'created' => !$existing,
			'updated' => (bool) $existing,
			'cache_maintenance_requested' => !empty($payload['purge_cache']),
		);
	}
}

if (!function_exists('adrotate_adops_now')) {
	function adrotate_adops_now() {
		if (function_exists('cod5_adops_preview_timestamp')) {
			return (int) cod5_adops_preview_timestamp();
		}
		return (int) current_time('timestamp');
	}
}

if (defined('WP_CLI') && WP_CLI) {
	class AdRotate_AdOps_Command {
		/**
		 * Lista anúncios e vínculo AdOps.
		 *
		 * ## OPTIONS
		 *
		 * [--group=<id>]
		 * : Filtra por grupo.
		 *
		 * [--limit=<n>]
		 * : Limite de resultados.
		 */
		public function inspect($args, $assoc_args) {
			global $wpdb;
			$limit = !empty($assoc_args['limit']) ? (int) $assoc_args['limit'] : 50;
			$where = '';
			if (!empty($assoc_args['group'])) {
				$where = $wpdb->prepare('WHERE lm.`group` = %d', (int) $assoc_args['group']);
			}

			$query = "
				SELECT a.id, a.title, a.type, lm.`group` AS group_id,
				       a.adops_insertion_id, a.adops_campaign_id, a.adops_pi_code,
				       a.adops_external_key, a.adops_media_basename, a.adops_synced_at,
				       CASE
				         WHEN a.image <> '' AND a.bannercode NOT LIKE '%asset%' THEN 'invalid_missing_asset'
				         WHEN a.image <> '' THEN 'ok_asset_token'
				         ELSE 'no_adrotate_asset'
				       END AS adops_adcode_status
				FROM `{$wpdb->prefix}adrotate` a
				LEFT JOIN `{$wpdb->prefix}adrotate_linkmeta` lm ON lm.ad = a.id AND lm.user = 0
				{$where}
				ORDER BY a.id DESC
				LIMIT {$limit}
			";
			$rows = $wpdb->get_results($query, ARRAY_A);
			\WP_CLI\Utils\format_items('table', $rows, array('id', 'title', 'type', 'group_id', 'adops_insertion_id', 'adops_campaign_id', 'adops_pi_code', 'adops_external_key', 'adops_media_basename', 'adops_synced_at', 'adops_adcode_status'));
		}

		/**
		 * Vincula um anúncio ao AdOps e atualiza o sufixo do título.
		 *
		 * ## OPTIONS
		 *
		 * <ad-id>
		 * : ID do anúncio no AdRotate.
		 *
		 * [--insertion=<id>]
		 * : ID da inserção no AdOps.
		 *
		 * [--campaign=<id>]
		 * : ID da campanha no AdOps.
		 *
		 * [--pi=<codigo>]
		 * : Código da PI/API.
		 *
		 * [--external-key=<key>]
		 * : Chave externa do vínculo.
		 *
		 * [--media-basename=<file>]
		 * : Nome do arquivo da mídia.
		 *
		 * [--apply]
		 * : Aplica de fato. Sem isso, mostra só o preview.
		 */
		public function link($args, $assoc_args) {
			global $wpdb;

			$ad_id = isset($args[0]) ? (int) $args[0] : 0;
			if ($ad_id <= 0) {
				\WP_CLI::error('Informe o ID do anúncio.');
			}

			$ad = $wpdb->get_row($wpdb->prepare("SELECT * FROM `{$wpdb->prefix}adrotate` WHERE `id` = %d", $ad_id), ARRAY_A);
			if (!$ad) {
				\WP_CLI::error('Anúncio não encontrado.');
			}

			$payload = adrotate_adops_prepare_payload(array(
				'insertion_id' => $assoc_args['insertion'] ?? null,
				'campaign_id' => $assoc_args['campaign'] ?? null,
				'pi_code' => $assoc_args['pi'] ?? '',
				'external_key' => $assoc_args['external-key'] ?? '',
				'media_basename' => $assoc_args['media-basename'] ?? '',
			));

			$next_title = adrotate_adops_normalize_title($ad['title'], $payload);
			$preview = array(
				'id' => $ad_id,
				'current_title' => $ad['title'],
				'next_title' => $next_title,
				'adops_insertion_id' => $payload['insertion_id'],
				'adops_campaign_id' => $payload['campaign_id'],
				'adops_pi_code' => $payload['pi_code'],
				'adops_external_key' => $payload['external_key'],
				'adops_media_basename' => $payload['media_basename'],
			);

			if (empty($assoc_args['apply'])) {
				\WP_CLI::line(wp_json_encode($preview, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
				\WP_CLI::success('Preview gerado. Use --apply para gravar.');
				return;
			}

			$wpdb->update(
				$wpdb->prefix.'adrotate',
				array(
					'title' => $next_title,
					'adops_insertion_id' => $payload['insertion_id'],
					'adops_campaign_id' => $payload['campaign_id'],
					'adops_pi_code' => $payload['pi_code'],
					'adops_external_key' => $payload['external_key'],
					'adops_media_basename' => $payload['media_basename'],
					'adops_synced_at' => current_time('timestamp'),
				),
				array('id' => $ad_id)
			);

			\WP_CLI::success('Anúncio vinculado ao AdOps com sucesso.');
		}

		/**
		 * Cria ou atualiza anúncio AdRotate a partir de uma inserção AdOps.
		 *
		 * ## OPTIONS
		 *
		 * --payload-json=<path>
		 * : Arquivo JSON resolvido pelo runner com inserção, mídia, grupo e período.
		 *
		 * [--apply]
		 * : Aplica de fato. Sem isso, mostra só o preview.
		 */
		public function publish($args, $assoc_args) {
			global $wpdb;

			$payload = adrotate_adops_read_json_file($assoc_args['payload-json'] ?? '');
			$insertion_id = !empty($payload['insertion_id']) ? (int) $payload['insertion_id'] : 0;
			$campaign_id = !empty($payload['campaign_id']) ? (int) $payload['campaign_id'] : 0;
			$group_id = !empty($payload['group_id']) ? (int) $payload['group_id'] : 0;
			$media_url = esc_url_raw($payload['media_url'] ?? '');
			$title = sanitize_text_field($payload['title'] ?? '');
			$replace_existing = !isset($payload['replace_existing']) || (bool) $payload['replace_existing'];

			if ($insertion_id <= 0 || $campaign_id <= 0 || $group_id <= 0 || $media_url === '') {
				\WP_CLI::error('Payload incompleto: insertion_id, campaign_id, group_id e media_url são obrigatórios.');
			}

			$ad_table = $wpdb->prefix.'adrotate';
			$schedule_table = $wpdb->prefix.'adrotate_schedule';
			$link_table = $wpdb->prefix.'adrotate_linkmeta';
			$prepared_payload = adrotate_adops_prepare_payload(array(
				'insertion_id' => $insertion_id,
				'campaign_id' => $campaign_id,
				'pi_code' => $payload['pi_code'] ?? '',
				'external_key' => $payload['external_key'] ?? ('adops-'.$insertion_id),
				'media_basename' => $payload['media_basename'] ?? basename(parse_url($media_url, PHP_URL_PATH) ?: ''),
			));

			$existing = $wpdb->get_row($wpdb->prepare(
				"SELECT * FROM `{$ad_table}` WHERE `adops_insertion_id` = %d ORDER BY `id` DESC LIMIT 1",
				$insertion_id
			), ARRAY_A);
			if (!$existing && !empty($prepared_payload['external_key'])) {
				$existing = $wpdb->get_row($wpdb->prepare(
					"SELECT * FROM `{$ad_table}` WHERE `adops_external_key` = %s ORDER BY `id` DESC LIMIT 1",
					$prepared_payload['external_key']
				), ARRAY_A);
			}

			$base_title = $title !== '' ? $title : ('AdOps Inserção '.$insertion_id);
			$next_title = adrotate_adops_normalize_title($base_title, $prepared_payload);
			$bannercode = adrotate_adops_build_bannercode(array_merge($payload, array('title' => $next_title)));
			$now = adrotate_adops_now();
			$ad_data = array(
				'title' => $next_title,
				'bannercode' => $bannercode,
				'image' => $media_url,
				'imagetype' => 'field',
				'type' => 'active',
				'tracker' => 'N',
				'desktop' => 'Y',
				'mobile' => 'Y',
				'autodelete' => 'N',
				'weight' => 6,
				'updated' => $now,
				'thetime' => $now,
				'author' => get_current_user_id(),
				'adops_insertion_id' => $prepared_payload['insertion_id'],
				'adops_campaign_id' => $prepared_payload['campaign_id'],
				'adops_pi_code' => $prepared_payload['pi_code'],
				'adops_external_key' => $prepared_payload['external_key'],
				'adops_media_basename' => $prepared_payload['media_basename'],
				'adops_synced_at' => current_time('timestamp'),
			);
			$ad_data = adrotate_adops_filter_columns($ad_table, $ad_data);

			$preview = array(
				'mode' => empty($assoc_args['apply']) ? 'preview' : 'apply',
				'existing_ad_id' => $existing['id'] ?? null,
				'group_id' => $group_id,
				'replace_existing' => $replace_existing,
				'replace_existing_group_links' => $replace_existing,
				'ad_data' => $ad_data,
				'bannercode_contains_asset' => strpos($bannercode, '%asset%') !== false,
				'payload' => array(
					'insertion_id' => $insertion_id,
					'campaign_id' => $campaign_id,
					'media_url' => $media_url,
					'period_start' => $payload['period_start'] ?? null,
					'period_end' => $payload['period_end'] ?? null,
					'slot_selector' => $payload['slot_selector'] ?? null,
				),
			);

			if (empty($assoc_args['apply'])) {
				\WP_CLI::line(wp_json_encode($preview, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
				\WP_CLI::success('Preview gerado. Use --apply para gravar.');
				return;
			}

			if ($existing) {
				$wpdb->update($ad_table, $ad_data, array('id' => (int) $existing['id']));
				$ad_id = (int) $existing['id'];
			} else {
				$wpdb->insert($ad_table, $ad_data);
				$ad_id = (int) $wpdb->insert_id;
			}
			if ($ad_id <= 0) {
				\WP_CLI::error('Falha ao criar ou atualizar anúncio AdRotate.');
			}

				$link_columns = adrotate_adops_table_columns($link_table);
				$schedule_columns = adrotate_adops_table_columns($schedule_table);
				$starttime = adrotate_adops_period_timestamp($payload['period_start'] ?? '', false);
				$stoptime = adrotate_adops_period_timestamp($payload['period_end'] ?? '', true);
				$schedule_id = (int) $wpdb->get_var($wpdb->prepare(
					"SELECT `schedule` FROM `{$link_table}` WHERE `ad` = %d AND `user` = 0 AND `group` = 0 AND `schedule` > 0 ORDER BY `id` DESC LIMIT 1",
					$ad_id
				));
				if ($replace_existing) {
					$wpdb->delete($link_table, array('ad' => $ad_id, 'user' => 0));
				}
				if ($starttime > 0 && $stoptime > 0 && !empty($schedule_columns)) {
				$schedule_data = adrotate_adops_filter_columns($schedule_table, array(
					'name' => 'Schedule for AdOps insertion '.$insertion_id,
					'starttime' => $starttime,
					'stoptime' => $stoptime,
					'maxclicks' => 0,
					'maximpressions' => 0,
					'spread' => 'N',
					'spread_all' => 'N',
					'daystarttime' => '0000',
					'daystoptime' => '0000',
					'day_mon' => 'Y',
					'day_tue' => 'Y',
					'day_wed' => 'Y',
					'day_thu' => 'Y',
					'day_fri' => 'Y',
					'day_sat' => 'Y',
					'day_sun' => 'Y',
					'autodelete' => 'N',
				));
				if ($schedule_id > 0) {
					$wpdb->update($schedule_table, $schedule_data, array('id' => $schedule_id));
				} else {
					$wpdb->insert($schedule_table, $schedule_data);
					$schedule_id = (int) $wpdb->insert_id;
				}
				if ($schedule_id <= 0) {
					\WP_CLI::error('Falha ao criar ou atualizar agenda AdRotate.');
				}
				$schedule_link = array('ad' => $ad_id, 'user' => 0, 'group' => 0, 'schedule' => $schedule_id);
				$wpdb->insert($link_table, adrotate_adops_filter_columns($link_table, $schedule_link));
			}
			if ($schedule_id > 0) {
				$scheduled_group_link = array('ad' => $ad_id, 'user' => 0, 'group' => $group_id, 'schedule' => $schedule_id);
				if (in_array('block', $link_columns, true)) {
					$scheduled_group_link['block'] = 0;
				}
				$existing_scheduled_group_link = $wpdb->get_var($wpdb->prepare(
					"SELECT COUNT(*) FROM `{$link_table}` WHERE `ad` = %d AND `user` = 0 AND `group` = %d AND `schedule` = %d",
					$ad_id,
					$group_id,
					$schedule_id
				));
				if ((int) $existing_scheduled_group_link <= 0) {
					$wpdb->insert($link_table, adrotate_adops_filter_columns($link_table, $scheduled_group_link));
				}
			}

			$link_data = array('ad' => $ad_id, 'user' => 0, 'group' => $group_id);
			if (in_array('block', $link_columns, true)) {
				$link_data['block'] = 0;
			}
			$existing_link = $wpdb->get_var($wpdb->prepare(
				"SELECT COUNT(*) FROM `{$link_table}` WHERE `ad` = %d AND `user` = 0 AND `group` = %d",
				$ad_id,
				$group_id
			));
			if ((int) $existing_link <= 0) {
				$wpdb->insert($link_table, adrotate_adops_filter_columns($link_table, $link_data));
			}

			if (!empty($payload['purge_cache'])) {
				adrotate_adops_run_maintenance();
			}

			$result = array(
				'ad_id' => $ad_id,
				'group_id' => $group_id,
				'schedule_id' => $schedule_id,
				'created' => !$existing,
				'updated' => (bool) $existing,
				'cache_maintenance_requested' => !empty($payload['purge_cache']),
			);
			\WP_CLI::line(wp_json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
			\WP_CLI::success('Anúncio AdRotate publicado pelo AdOps com sucesso.');
		}
	}

	\WP_CLI::add_command('adrotate adops', 'AdRotate_AdOps_Command');
	\WP_CLI::add_command('adops-adrotate-publish', array(new AdRotate_AdOps_Command(), 'publish'));
}
