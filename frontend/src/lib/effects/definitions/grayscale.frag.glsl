precision mediump float;

varying vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_amount;

void main() {
	vec4 color = texture2D(u_texture, v_texCoord);
	float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
	vec3 gray = vec3(luminance);
	vec3 finalColor = mix(color.rgb, gray, u_amount);
	gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), color.a);
}
