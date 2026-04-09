precision mediump float;

varying vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_brightness;

void main() {
	vec4 color = texture2D(u_texture, v_texCoord);
	color.rgb += vec3(u_brightness);
	gl_FragColor = vec4(clamp(color.rgb, 0.0, 1.0), color.a);
}
