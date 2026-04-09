import React, { useMemo } from "react";
import styled from "@emotion/styled";
import { css, keyframes } from "@emotion/react";
import { useCurrentPlayerFrame } from "../../hooks/use-current-frame";
import useStore from "../../store/use-store";
import { ANIMATION_CAPTION_LIST } from "./caption-animations";
import {
  createAnimationFunctions,
  ANIMATION_CONFIGS,
  ANIMATION_FUNCTIONS,
  WordAnimationState
} from "./caption-word-animations";

const scalePulse = keyframes`
  0% { transform: scale(1); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
`;

interface WordSpanProps {
  isActive: boolean;
  activeFillColor: string;
  wordColor: string;
  scale: number;
  animation: string;
  isAppeared: boolean;
  scaleFactor: number;
  animationNoneCaption: boolean;
  showObject: string;
}

const WordSpan = styled.span<WordSpanProps>`
  position: relative;
  display: inline-block;
  padding: 0 0.2em;
  color: ${(props) => props.wordColor};
  scale: ${(props) => props.scale};
  border-radius: 16px;
  z-index: 99;
  transition: opacity 0.2s ease;

  ${(props) => {
    if (props.isActive && props.animation.includes("underline-effect")) {
      return `
        text-decoration: underline;
        text-decoration-color: #9238ef;
        text-decoration-thickness: 0.2em;
      `;
    }

    if (!props.isActive && props.animationNoneCaption) {
      return `display: none;`;
    }

    if (
      !props.isAppeared &&
      (ANIMATION_CAPTION_LIST.includes(props.animation) ||
        props.showObject === "word")
    ) {
      return `display: none;`;
    }

    if (!props.isActive && props.animation === "customAnimation1") {
      return `display: none;`;
    }

    return "";
  }}

  &::before {
    content: "";
    position: absolute;
    z-index: -1;
    left: -0.2em;
    right: -0.2em;
    top: 0;
    bottom: 0;
    transition: background-color 0.2s ease;
    border-radius: ${(props) => `${props.scaleFactor * 16}px`};
  }

  ${(props) =>
    props.isActive &&
    css`
      &::before {
        background-color: ${props.activeFillColor};

        ${props.animation === "captionAnimation10" ||
        props.animation === "captionAnimationKeyword42" ||
        props.animation === "captionAnimationKeyword57" ||
        (props.animation === "captionAnimationKeyword48" &&
          css`
            animation: ${scalePulse} 0.4s ease-in-out;
            transform-origin: center;
          `)}
      }
    `}
`;

interface CaptionWordProps {
  word: any;
  offsetFrom: number;
  activeColor: string;
  activeFillColor: string;
  appearedColor: string;
  color: string;
  animation: string;
  globalOpacity?: number;
  isKeywordColor: string;
  preservedColorKeyWord: boolean;
  scaleFactor: number;
  animationNoneCaption: boolean;
  showObject: string;
  lineIndex?: number;
  currentLine?: number;
}

const CaptionWordComponent: React.FC<CaptionWordProps> = ({
  word,
  offsetFrom,
  activeColor,
  activeFillColor,
  appearedColor,
  color,
  animation,
  globalOpacity,
  isKeywordColor,
  preservedColorKeyWord,
  scaleFactor,
  animationNoneCaption,
  showObject,
  lineIndex,
  currentLine
}) => {
  const fps = 30;
  const playerRef = useStore((state) => state.playerRef);
  const currentFrame = useCurrentPlayerFrame(playerRef!);
  const { start, end } = word;
  const startAtFrame = useMemo(
    () => ((start + offsetFrom) / 1000) * fps,
    [fps, offsetFrom, start]
  );
  const endAtFrame = useMemo(
    () => ((end + offsetFrom) / 1000) * fps,
    [end, fps, offsetFrom]
  );
  const isActive = currentFrame > startAtFrame && currentFrame < endAtFrame;
  const isAppeared = currentFrame > startAtFrame;

  // Handle line-based visibility
  if (
    showObject === "line" &&
    lineIndex !== undefined &&
    currentLine !== undefined
  ) {
    if (lineIndex > currentLine) {
      return null;
    }
  }

  // Word color logic
  const wordColor = getWordColor({
    activeColor,
    appearedColor,
    color,
    isActive,
    isAppeared,
    isKeywordColor,
    preservedColorKeyWord,
    word
  });

  // Calculate animation state
  const animationState = calculateAnimationState(
    currentFrame,
    startAtFrame,
    endAtFrame,
    animation,
    word,
    globalOpacity
  );

  const displayText = getDisplayText({
    animation,
    currentFrame,
    endAtFrame,
    startAtFrame,
    word
  });

  const transformStyle = getTransformStyle(animationState);

  return (
    <WordSpan
      isActive={isActive}
      wordColor={wordColor}
      activeFillColor={activeFillColor}
      scale={animationState.scale}
      animation={animation}
      animationNoneCaption={animationNoneCaption}
      style={{
        opacity: animationState.opacity,
        ...(transformStyle && { transform: transformStyle })
      }}
      isAppeared={isAppeared}
      scaleFactor={scaleFactor}
      showObject={showObject}
    >
      {displayText}
    </WordSpan>
  );
};

export const CaptionWord = React.memo(CaptionWordComponent);

function getWordColor({
  activeColor,
  appearedColor,
  color,
  isActive,
  isAppeared,
  isKeywordColor,
  preservedColorKeyWord,
  word
}: {
  activeColor: string;
  appearedColor: string;
  color: string;
  isActive: boolean;
  isAppeared: boolean;
  isKeywordColor: string;
  preservedColorKeyWord: boolean;
  word: any;
}) {
  const baseColor = isActive ? activeColor : isAppeared ? appearedColor : color;

  if (
    word.is_keyword &&
    isKeywordColor !== "transparent" &&
    (isActive || (preservedColorKeyWord && isAppeared))
  ) {
    return isKeywordColor;
  }

  return baseColor;
}

function getDisplayText({
  animation,
  currentFrame,
  endAtFrame,
  startAtFrame,
  word
}: {
  animation: string;
  currentFrame: number;
  endAtFrame: number;
  startAtFrame: number;
  word: any;
}) {
  if (!animation.includes("typewriter-effect")) {
    return word.word;
  }

  const totalLetters = word.word.length;
  const animationDuration = endAtFrame - startAtFrame;
  const lettersToShow = Math.min(
    totalLetters,
    Math.floor(((currentFrame - startAtFrame) / animationDuration) * totalLetters)
  );

  return word.word.slice(0, lettersToShow);
}

function getTransformStyle(animationState: WordAnimationState) {
  if (animationState.translateX === 0 && animationState.translateY === 0) {
    return undefined;
  }

  return `translate(${animationState.translateX}px, ${animationState.translateY}px)`;
}

function calculateAnimationState(
  currentFrame: number,
  startAtFrame: number,
  endAtFrame: number,
  animation: string,
  word: any,
  globalOpacity?: number
): WordAnimationState {
  const initialState: WordAnimationState = {
    opacity: 1,
    scale: 1,
    translateX: 0,
    translateY: 0
  };

  // Apply basic animation effects
  const basicEffects = {
    scaleAnimationLetterEffect: () => ({
      scale:
        currentFrame > startAtFrame && currentFrame < endAtFrame ? 1.4 : 0.9
    }),
    animationScaleMinEffect: () => ({ scale: 0.8 }),
    animationScaleDinamicEffect: () => ({ scale: word.is_keyword ? 1.4 : 0.9 }),
    captionAnimation26: () => ({
      opacity:
        currentFrame > startAtFrame && currentFrame < endAtFrame ? 1 : 0.6
    })
  };

  // Apply basic effects
  Object.entries(basicEffects).forEach(([effect, handler]) => {
    if (animation.includes(effect) || animation === effect) {
      Object.assign(initialState, handler());
    }
  });

  // Create animation helpers
  const animationHelpers = createAnimationFunctions(
    currentFrame,
    startAtFrame,
    endAtFrame
  );

  // Apply animation configurations
  const animationConfig = ANIMATION_CONFIGS[animation];
  if (animationConfig) {
    const configResult = animationConfig(animationHelpers);
    Object.assign(initialState, configResult);
  }

  // Apply animation functions from slash-separated animations
  const selectedAnimations = animation.split("/") || [];
  selectedAnimations.forEach((anim) => {
    const animationFn = ANIMATION_FUNCTIONS[anim];
    if (animationFn) {
      const result = animationFn(animationHelpers);
      Object.assign(initialState, result);
    }
  });

  // Handle global opacity
  if (globalOpacity !== undefined) {
    initialState.opacity = globalOpacity;
  }

  return initialState;
}
