<?php
// Shared import map: every game page includes this so all games use the same vendored three.js.
// WebGPU build by default (falls back to WebGL2 automatically; force with ?webgl).
$v = '/vendor/three';
?>
<script type="importmap">{"imports":{
  "three":"<?= $v ?>/build/three.webgpu.js",
  "three/webgpu":"<?= $v ?>/build/three.webgpu.js",
  "three/tsl":"<?= $v ?>/build/three.tsl.js",
  "three/addons/":"<?= $v ?>/examples/jsm/"
}}</script>
