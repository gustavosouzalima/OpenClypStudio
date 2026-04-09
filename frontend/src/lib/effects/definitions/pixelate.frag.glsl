precision mediump float;

varying vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_pixel_size;

void main() {
	vec2 size = vec2(max(u_pixel_size, 1.0));
	vec2 uv = floor(v_texCoord * u_resolution / size) * size / u_resolution;
	gl_FragColor = texture2D(u_texture, uv);
}
