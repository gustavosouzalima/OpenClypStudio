import { useEffect, useRef } from "react";

export function useRafLoop(
	callback: ({ time }: { time: number }) => void,
	enabled: boolean = true,
) {
	const requestRef = useRef<number>(0);
	const previousTimeRef = useRef<number | null>(null);

	useEffect(() => {
		if (!enabled) {
			if (requestRef.current) {
				cancelAnimationFrame(requestRef.current);
				requestRef.current = 0;
			}
			return;
		}

		const loop = ({ time }: { time: number }) => {
			if (previousTimeRef.current !== null) {
				const deltaTime = time - previousTimeRef.current;
				callback({ time: deltaTime });
			}
			previousTimeRef.current = time;
			requestRef.current = requestAnimationFrame((time) => loop({ time }));
		};

		requestRef.current = requestAnimationFrame((time) => loop({ time }));
		return () => cancelAnimationFrame(requestRef.current);
	}, [callback, enabled]);
}
