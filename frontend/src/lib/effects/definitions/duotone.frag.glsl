precision mediump float;

uniform sampler2D u_texture;
uniform vec3 u_shadowColor;
uniform vec3 u_highlightColor;
uniform float u_mixAmount;

varying vec2 v_texCoord;

vec3 hexMix(vec3 a, vec3 b, float t) {
  return mix(a, b, t);
}

void main() {
  vec4 color = texture2D(u_texture, v_texCoord);
  float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  vec3 duotone = hexMix(u_shadowColor, u_highlightColor, luminance);
  vec3 finalColor = mix(color.rgb, duotone, u_mixAmount);
  gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), color.a);
}
