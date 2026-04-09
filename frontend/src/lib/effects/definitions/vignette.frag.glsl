precision mediump float;

varying vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_intensity;
uniform float u_softness;

void main() {
	vec4 color = texture2D(u_texture, v_texCoord);
	vec2 position = v_texCoord - vec2(0.5);
	float distanceFromCenter = length(position) * 1.41421356;
	float vignette = smoothstep(1.0, max(0.0001, 1.0 - u_softness), distanceFromCenter);
	float darkening = 1.0 - (vignette * u_intensity);
	gl_FragColor = vec4(clamp(color.rgb * darkening, 0.0, 1.0), color.a);
}
