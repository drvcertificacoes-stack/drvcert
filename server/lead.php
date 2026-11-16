<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function drv_response(int $status, array $body): void {
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    drv_response(405, ['ok' => false, 'message' => 'Método não permitido.']);
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && !in_array(strtolower((string) parse_url($origin, PHP_URL_HOST)), ['drvcertificacoes.com.br', 'www.drvcertificacoes.com.br'], true)) {
    drv_response(403, ['ok' => false, 'message' => 'Origem não autorizada.']);
}
$contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
if (strpos($contentType, 'application/json') !== 0) {
    drv_response(415, ['ok' => false, 'message' => 'Formato de envio não suportado.']);
}
$raw = file_get_contents('php://input', false, null, 0, 65537);
if ($raw === false || strlen($raw) > 65536) {
    drv_response(413, ['ok' => false, 'message' => 'Solicitação muito grande.']);
}
$data = json_decode($raw, true);
if (!is_array($data)) {
    drv_response(400, ['ok' => false, 'message' => 'Dados de solicitação inválidos.']);
}

// Corta por caracteres (não por bytes) para não quebrar acentos no meio do UTF-8.
function drv_cut(string $value, int $limit): string {
    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $limit, 'UTF-8');
    }
    preg_match('/^.{0,' . $limit . '}/us', $value, $match);
    return $match[0] ?? substr($value, 0, $limit);
}
function drv_field(array $data, string $key, int $limit = 2000): string {
    $value = $data[$key] ?? '';
    if (!is_scalar($value)) {
        return '';
    }
    $value = str_replace("\0", '', (string) $value);
    if (!preg_match('//u', $value)) {
        $value = function_exists('mb_convert_encoding') ? mb_convert_encoding($value, 'UTF-8', 'UTF-8') : '';
    }
    return trim(drv_cut(trim($value), $limit));
}
$email = drv_field($data, 'Email', 254);
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $email)) {
    drv_response(422, ['ok' => false, 'message' => 'Informe um endereço de e-mail válido.']);
}
if (drv_field($data, 'Mensagem', 12000) === '' && drv_field($data, 'Interesse', 300) === '') {
    drv_response(422, ['ok' => false, 'message' => 'Informe o serviço de interesse ou uma mensagem.']);
}

function drv_smtp_failure(string $detail): array {
    $text = strtolower($detail);
    if (preg_match('/authenticate|authentication|invalid credentials|535|534/', $text)) {
        return ['authentication', 'A Titan recusou a autenticação. Confira a senha SMTP, o acesso por aplicativos externos e, se houver verificação em duas etapas, a senha de aplicativo.'];
    }
    if (preg_match('/certificate|verify failed|crypto|tls negotiation|ssl operation/', $text)) {
        return ['tls', 'A hospedagem não conseguiu validar a conexão segura com a Titan. Peça ao suporte para verificar os certificados e a conexão SMTP, sem desativar a segurança TLS.'];
    }
    if (preg_match('/quota|rate limit|too many|daily limit|sending limit/', $text)) {
        return ['limit', 'O serviço de e-mail informou um limite de envio. Aguarde ou consulte o suporte da Titan.'];
    }
    if (preg_match('/connect|timed out|timeout|refused|network|resolve|unreachable/', $text)) {
        return ['connection', 'A hospedagem não conseguiu conectar ao SMTP da Titan. Peça ao suporte para liberar ou verificar a conexão de saída para smtp.titan.email na porta configurada.'];
    }
    if (preg_match('/from address|sender|relay|recipient|recipients|data not accepted/', $text)) {
        return ['rejected', 'A Titan recusou a mensagem ou o endereço de envio. Peça ao suporte para verificar a conta comercial e as permissões de envio.'];
    }
    if (preg_match('/failed opening|required|class .*not found|no such file/', $text)) {
        return ['installation', 'Os arquivos do serviço de e-mail não foram encontrados corretamente. Confira a extração da pasta drv-mailer dentro de public_html.'];
    }
    return ['unknown', 'O envio não foi confirmado. Peça ao suporte da hospedagem a análise do erro SMTP associado ao protocolo.'];
}

$requestId = bin2hex(random_bytes(6));
$configFile = dirname(__DIR__) . '/drv-smtp-config.php';
if (!is_file($configFile)) {
    error_log('[DRV SMTP ' . $requestId . '] Arquivo de configuração ausente.');
    drv_response(503, ['ok' => false, 'request_id' => $requestId, 'message' => 'O envio de e-mail ainda não foi configurado na hospedagem. Entre em contato pelo WhatsApp.']);
}
try {
    $config = require $configFile;
} catch (Throwable $e) {
    error_log('[DRV SMTP ' . $requestId . '] Não foi possível ler a configuração.');
    drv_response(503, ['ok' => false, 'request_id' => $requestId, 'message' => 'A configuração de envio precisa ser revisada. Entre em contato pelo WhatsApp.']);
}
if (!is_array($config) || empty($config['password']) || $config['password'] === 'PREENCHA_A_SENHA_AQUI') {
    drv_response(503, ['ok' => false, 'request_id' => $requestId, 'message' => 'A senha SMTP ainda não foi configurada na hospedagem. Entre em contato pelo WhatsApp.']);
}
$host = (string) ($config['host'] ?? '');
$port = (int) ($config['port'] ?? 465);
$encryption = (string) ($config['encryption'] ?? 'ssl');
$username = (string) ($config['username'] ?? '');
if ($host !== 'smtp.titan.email' || !in_array([$port, $encryption], [[465, 'ssl'], [587, 'tls']], true) || $username !== 'comercial@drvcertificacoes.com.br') {
    drv_response(503, ['ok' => false, 'request_id' => $requestId, 'message' => 'A configuração SMTP da Titan precisa ser revisada.']);
}
if (!extension_loaded('openssl')) {
    drv_response(503, ['ok' => false, 'request_id' => $requestId, 'message' => 'O serviço de envio seguro está indisponível. Entre em contato pelo WhatsApp.']);
}

// Limit public submissions without storing form contents or raw IP addresses.
$rateDir = dirname(__DIR__) . '/.drv-mail-rate';
if (!is_dir($rateDir) && !@mkdir($rateDir, 0700, true) && !is_dir($rateDir)) {
    drv_response(503, ['ok' => false, 'request_id' => $requestId, 'message' => 'O serviço de envio está temporariamente indisponível.']);
}
$rateFile = $rateDir . '/' . hash_hmac('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), (string) $config['password']) . '.json';
$rateHandle = @fopen($rateFile, 'c+');
if (!$rateHandle || !flock($rateHandle, LOCK_EX)) {
    if (is_resource($rateHandle)) { fclose($rateHandle); }
    drv_response(503, ['ok' => false, 'request_id' => $requestId, 'message' => 'O serviço de envio está temporariamente indisponível.']);
}
// Remove ocasionalmente registros antigos para a pasta não crescer sem limite.
if (random_int(1, 50) === 1) {
    foreach (glob($rateDir . '/*.json') ?: [] as $oldFile) {
        if (@filemtime($oldFile) < time() - 86400) { @unlink($oldFile); }
    }
}
$rate = json_decode(stream_get_contents($rateHandle) ?: '{}', true);
$now = time();
if (!is_array($rate) || $now - (int) ($rate['start'] ?? 0) > 600) { $rate = ['start' => $now, 'count' => 0]; }
if ((int) ($rate['count'] ?? 0) >= 10) {
    flock($rateHandle, LOCK_UN); fclose($rateHandle);
    header('Retry-After: 600');
    drv_response(429, ['ok' => false, 'request_id' => $requestId, 'message' => 'Muitas tentativas em pouco tempo. Aguarde alguns minutos ou fale pelo WhatsApp.']);
}
$rate['count'] = (int) ($rate['count'] ?? 0) + 1;
rewind($rateHandle); ftruncate($rateHandle, 0); fwrite($rateHandle, json_encode($rate)); fflush($rateHandle); flock($rateHandle, LOCK_UN); fclose($rateHandle);

$fields = ['Origem', 'Nome', 'Empresa', 'Telefone', 'Email', 'Interesse', 'Mensagem', 'UTM_Source', 'UTM_Medium', 'UTM_Campaign', 'UTM_Term', 'UTM_Content', 'GCLID', 'FBCLID', 'Lead_Origin', 'Landing_Page', 'First_Page', 'Last_Page', 'First_Referrer'];
$lines = ['Solicitação de cotação pelo site drvcertificacoes.com.br', 'Protocolo: ' . $requestId, ''];
foreach ($fields as $field) { $lines[] = $field . ': ' . drv_field($data, $field, $field === 'Mensagem' ? 12000 : 2000); }
$lines[] = '';
$lines[] = 'Recebido em UTC: ' . gmdate('Y-m-d H:i:s');
$subject = str_replace(["\r", "\n"], ' ', drv_field($data, '_subject', 200));
if ($subject === '') { $subject = 'Nova solicitação de cotação - DRV Certificações'; }

try {
    require_once __DIR__ . '/drv-mailer/src/Exception.php';
    require_once __DIR__ . '/drv-mailer/src/PHPMailer.php';
    require_once __DIR__ . '/drv-mailer/src/SMTP.php';
    $mailer = new \PHPMailer\PHPMailer\PHPMailer(true);
    $mailer->isSMTP();
    $mailer->Host = $host;
    $mailer->Port = $port;
    $mailer->SMTPAuth = true;
    $mailer->Username = $username;
    $mailer->Password = (string) $config['password'];
    $mailer->SMTPSecure = $encryption;
    $mailer->SMTPDebug = 0;
    $mailer->Timeout = 20;
    $mailer->CharSet = 'UTF-8';
    $mailer->setFrom($username, 'DRV Certificações');
    $mailer->addAddress('comercial@drvcertificacoes.com.br');
    $mailer->addReplyTo($email);
    $mailer->Subject = $subject;
    $mailer->Body = implode("\r\n", $lines);
    $mailer->isHTML(false);
    if (!$mailer->send()) { throw new RuntimeException('Envio SMTP não confirmado.'); }
    drv_response(200, ['ok' => true, 'status' => 'accepted', 'request_id' => $requestId, 'message' => 'Solicitação aceita pelo servidor de e-mail.']);
} catch (Throwable $e) {
    // Categorize locally; never expose credentials or the SMTP transcript.
    $diagnostic = $e->getMessage();
    $smtpCode = '';
    if (isset($mailer) && is_object($mailer)) {
        $diagnostic .= ' ' . (string) ($mailer->ErrorInfo ?? '');
        if (method_exists($mailer, 'getSMTPInstance')) {
            $smtpError = $mailer->getSMTPInstance()->getError();
            if (is_array($smtpError)) {
                $diagnostic .= ' ' . (string) ($smtpError['error'] ?? '') . ' ' . (string) ($smtpError['detail'] ?? '');
                $smtpCode = preg_replace('/[^0-9.]/', '', (string) ($smtpError['smtp_code'] ?? ''));
            }
        }
    }
    [$category, $explanation] = drv_smtp_failure($diagnostic);
    error_log('[DRV SMTP ' . $requestId . '] Categoria: ' . $category . '; SMTP: ' . $smtpCode . '; tipo: ' . get_class($e));
    // O diagnóstico detalhado ($explanation) fica só no log do servidor; o visitante recebe uma mensagem genérica.
    error_log('[DRV SMTP ' . $requestId . '] Orientação: ' . $explanation);
    drv_response(502, ['ok' => false, 'request_id' => $requestId, 'message' => 'Não foi possível enviar sua solicitação agora. Tente novamente em alguns minutos ou fale com a DRV pelo WhatsApp (21) 99974-9929. Protocolo: ' . $requestId . '.']);
}
