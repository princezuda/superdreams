<?php
// Dev server router: php -S 127.0.0.1:8080 router.php
// Serves static files with the right MIME (wasm, modules) and gzip; everything else falls to PHP.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$file = __DIR__ . $path;
$mime = ['wasm'=>'application/wasm','js'=>'text/javascript','mjs'=>'text/javascript','json'=>'application/json',
         'css'=>'text/css','svg'=>'image/svg+xml','glb'=>'model/gltf-binary','gltf'=>'model/gltf+json','ktx2'=>'image/ktx2'];
$ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
if (is_file($file) && isset($mime[$ext])) {
  header('Content-Type: ' . $mime[$ext]);
  if (str_starts_with($path, '/vendor/')) header('Cache-Control: public, max-age=31536000, immutable');
  $body = file_get_contents($file);
  if ($ext !== 'wasm' && str_contains($_SERVER['HTTP_ACCEPT_ENCODING'] ?? '', 'gzip')) { header('Content-Encoding: gzip'); $body = gzencode($body, 6); }
  header('Content-Length: ' . strlen($body)); echo $body; return true;
}
return false; // let PHP's built-in server handle .php, .html, images, directories
