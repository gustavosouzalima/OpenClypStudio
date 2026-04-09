precision mediump float;

varying vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_amount;

void main() {
	vec4 color = texture2D(u_texture, v_texCoord);
	vec3 sepia = vec3(
		dot(color.rgb, vec3(0.393, 0.769, 0.189)),
		dot(color.rgb, vec3(0.349, 0.686, 0.168)),
		dot(color.rgb, vec3(0.272, 0.534, 0.131))
	);
	vec3 finalColor = mix(color.rgb, sepia, u_amount);
	gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), color.a);
}
