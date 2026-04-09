precision mediump float;

uniform sampler2D u_texture;
uniform float u_threshold;

varying vec2 v_texCoord;

void main() {
  vec4 color = texture2D(u_texture, v_texCoord);
  float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  float value = step(u_threshold, luminance);
  gl_FragColor = vec4(vec3(value), color.a);
}
