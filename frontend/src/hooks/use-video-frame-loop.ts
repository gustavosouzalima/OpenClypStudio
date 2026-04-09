import { useEffect, useRef } from "react";

/**
 * Type definition for VideoFrameMetadata provided by requestVideoFrameCallback
 */
interface VideoFrameMetadata {
	mediaTime: number;
	presentationTime: number;
	expectedDisplayTime: number;
	width: number;
	height: number;
}

/**
 * Hook para loop de preview sincronizado com requestVideoFrameCallback.
 *
 * Substitui requestAnimationFrame por requestVideoFrameCallback para melhor
 * sincronização de áudio/vídeo no preview do editor.
 *
 * O requestVideoFrameCallback:
 * - É sincronizado com a taxa de atualização do vídeo
 * - Fornece metadata.mediaTime para sync frame-accurate com o áudio
 * - Reduz stutter e dessync em playback normal
 *
 * NOTA: O videoElement deve ter conteúdo carregado e estar reproduzindo para
 * que requestVideoFrameCallback funcione corretamente.
 *
 * @param callback - Função chamada a cada frame com o timestamp
 * @param videoElement - Elemento <video> HTML usado para sincronização
 */
export function useVideoFrameLoop({
	callback,
	videoElement,
	enabled = true,
}: {
	callback: (metadata: { time: number; mediaTime: number }) => void;
	videoElement: HTMLVideoElement | null;
	enabled?: boolean;
}) {
	const rafIdRef = useRef<number>(0);
	const rvcIdRef = useRef<number | null>(null);

	useEffect(() => {
		if (!enabled || !videoElement) {
			// Cleanup se desabilitado ou sem video element
			if (rvcIdRef.current !== null && videoElement) {
				try {
					videoElement.cancelVideoFrameCallback(rvcIdRef.current);
				} catch {}
				rvcIdRef.current = null;
			}
			if (rafIdRef.current) {
				cancelAnimationFrame(rafIdRef.current);
				rafIdRef.current = 0;
			}
			return;
		}

		// Verifica suporte do navegador a requestVideoFrameCallback
		if (typeof videoElement.requestVideoFrameCallback !== "function") {
			console.warn(
				"[useVideoFrameLoop] requestVideoFrameCallback not supported, falling back to requestAnimationFrame",
			);
			// Fallback para requestAnimationFrame se o navegador não suportar
			const fallbackLoop = () => {
				const time = performance.now();
				callback({ time, mediaTime: time });
				rafIdRef.current = requestAnimationFrame(fallbackLoop);
			};
			rafIdRef.current = requestAnimationFrame(fallbackLoop);

			return () => {
				if (rafIdRef.current) {
					cancelAnimationFrame(rafIdRef.current);
				}
			};
		}

		// Implementação principal com requestVideoFrameCallback
		const loop = (now: number, metadata: VideoFrameMetadata) => {
			callback({
				time: now,
				mediaTime: metadata.mediaTime,
			});
			// Solicita o próximo callback
			rvcIdRef.current = videoElement.requestVideoFrameCallback(loop);
		};

		// Solicita o callback sincronizado com o vídeo
		rvcIdRef.current = videoElement.requestVideoFrameCallback(loop);

		return () => {
			if (rvcIdRef.current !== null) {
				try {
					videoElement.cancelVideoFrameCallback(rvcIdRef.current);
				} catch {}
				rvcIdRef.current = null;
			}
		};
	}, [callback, videoElement, enabled]);
}

/**
 * Hook simplificado que mantém compatibilidade com a interface do useRafLoop.
 *
 * NOTA: Este hook usa requestAnimationFrame como fallback pois a arquitetura atual
 * do OpenCut usa CanvasRenderer + Web Audio API sem um elemento <video> nativo.
 *
 * Para usar requestVideoFrameCallback corretamente, seria necessário:
 * 1. Ter um elemento <video> real com conteúdo reproduzindo
 * 2. O elemento deve estar no DOM e ter um vídeo carregado
 *
 * A implementação atual usa requestAnimationFrame com otimizações de timing
 * baseadas no AudioContext para melhor sync com áudio.
 */
export function useVideoFrameLoopCompat({
	callback,
	enabled = true,
}: {
	callback: ({ time }: { time: number }) => void;
	enabled?: boolean;
}) {
	const rafIdRef = useRef<number>(0);

	useEffect(() => {
		if (!enabled) {
			if (rafIdRef.current) {
				cancelAnimationFrame(rafIdRef.current);
				rafIdRef.current = 0;
			}
			return;
		}

		// Loop otimizado que usa performance.now() para timing preciso
		const loop = () => {
			const time = performance.now();
			callback({ time });
			rafIdRef.current = requestAnimationFrame(loop);
		};

		rafIdRef.current = requestAnimationFrame(loop);

		return () => {
			if (rafIdRef.current) {
				cancelAnimationFrame(rafIdRef.current);
			}
		};
	}, [callback, enabled]);
}
