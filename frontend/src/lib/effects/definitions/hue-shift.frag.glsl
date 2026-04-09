precision mediump float;

varying vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_angle;

vec3 rgb2yiq(vec3 color) {
	return vec3(
		dot(color, vec3(0.299, 0.587, 0.114)),
		dot(color, vec3(0.596, -0.274, -0.322)),
		dot(color, vec3(0.211, -0.523, 0.312))
	);
}

vec3 yiq2rgb(vec3 yiq) {
	return vec3(
		dot(yiq, vec3(1.0, 0.956, 0.621)),
		dot(yiq, vec3(1.0, -0.272, -0.647)),
		dot(yiq, vec3(1.0, -1.107, 1.704))
	);
}

void main() {
	vec4 color = texture2D(u_texture, v_texCoord);
	vec3 yiq = rgb2yiq(color.rgb);
	float hue = atan(yiq.z, yiq.y) + u_angle;
	float chroma = sqrt(yiq.y * yiq.y + yiq.z * yiq.z);
	vec3 shifted = yiq2rgb(vec3(yiq.x, chroma * cos(hue), chroma * sin(hue)));
	gl_FragColor = vec4(clamp(shifted, 0.0, 1.0), color.a);
}
