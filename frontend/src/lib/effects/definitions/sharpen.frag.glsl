precision mediump float;

uniform sampler2D u_texture;
uniform float u_amount;
uniform float u_texelWidth;
uniform float u_texelHeight;

varying vec2 v_texCoord;

void main() {
  vec2 texel = vec2(u_texelWidth, u_texelHeight);
  vec4 center = texture2D(u_texture, v_texCoord);
  vec4 north = texture2D(u_texture, v_texCoord + vec2(0.0, -texel.y));
  vec4 south = texture2D(u_texture, v_texCoord + vec2(0.0, texel.y));
  vec4 east = texture2D(u_texture, v_texCoord + vec2(texel.x, 0.0));
  vec4 west = texture2D(u_texture, v_texCoord + vec2(-texel.x, 0.0));
  vec4 sharpened = center * (1.0 + 4.0 * u_amount) - (north + south + east + west) * u_amount;
  gl_FragColor = vec4(clamp(sharpened.rgb, 0.0, 1.0), center.a);
}
