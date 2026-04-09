precision mediump float;

uniform sampler2D u_texture;
uniform float u_temperature;

varying vec2 v_texCoord;

void main() {
  vec4 color = texture2D(u_texture, v_texCoord);
  color.r += u_temperature * 0.18;
  color.b -= u_temperature * 0.18;
  gl_FragColor = vec4(clamp(color.rgb, 0.0, 1.0), color.a);
}
