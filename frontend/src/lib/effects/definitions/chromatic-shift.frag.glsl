precision mediump float;

uniform sampler2D u_texture;
uniform float u_offset;
uniform float u_texelWidth;

varying vec2 v_texCoord;

void main() {
  vec2 redUv = v_texCoord + vec2(u_texelWidth * u_offset, 0.0);
  vec2 blueUv = v_texCoord - vec2(u_texelWidth * u_offset, 0.0);
  float r = texture2D(u_texture, redUv).r;
  float g = texture2D(u_texture, v_texCoord).g;
  float b = texture2D(u_texture, blueUv).b;
  float a = texture2D(u_texture, v_texCoord).a;
  gl_FragColor = vec4(clamp(vec3(r, g, b), 0.0, 1.0), a);
}
