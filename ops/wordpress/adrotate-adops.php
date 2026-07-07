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
	}

	\WP_CLI::add_command('adrotate adops', 'AdRotate_AdOps_Command');
}
