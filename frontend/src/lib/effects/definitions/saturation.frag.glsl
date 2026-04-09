precision mediump float;

varying vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_saturation;

void main() {
	vec4 color = texture2D(u_texture, v_texCoord);
	float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
	vec3 gray = vec3(luminance);
	vec3 saturated = mix(gray, color.rgb, u_saturation);
	gl_FragColor = vec4(clamp(saturated, 0.0, 1.0), color.a);
}
