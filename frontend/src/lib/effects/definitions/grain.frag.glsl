precision mediump float;

varying vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_amount;

float random(vec2 co) {
	return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
	vec4 color = texture2D(u_texture, v_texCoord);
	float noise = random(v_texCoord) - 0.5;
	vec3 finalColor = color.rgb + vec3(noise * u_amount);
	gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), color.a);
}
