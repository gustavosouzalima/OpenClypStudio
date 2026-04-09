precision mediump float;

varying vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_amount;

void main() {
	vec4 color = texture2D(u_texture, v_texCoord);
	vec3 inverted = vec3(1.0) - color.rgb;
	vec3 finalColor = mix(color.rgb, inverted, u_amount);
	gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), color.a);
}
