import dynamic from "next/dynamic";
import useLayoutStore from "../../store/use-layout-store";
import { AnimatePresence, motion } from "framer-motion";

const AnimationCaption = dynamic(() => import("./animation-caption"), {
  loading: () => null
});
const AnimationPicker = dynamic(() => import("./animation-picker"), {
  loading: () => null
});
const CaptionPresetPicker = dynamic(() => import("./caption-preset-picker"), {
  loading: () => null
});
const FontFamilyPicker = dynamic(() => import("./font-family-picker"), {
  loading: () => null
});
const TextPresetPicker = dynamic(() => import("./text-preset-picker"), {
  loading: () => null
});

export default function FloatingControl() {
  const floatingControl = useLayoutStore((state) => state.floatingControl);
  const trackItem = useLayoutStore((state) => state.trackItem);

  if (!trackItem) return null;

  const controlContent = (() => {
    if (floatingControl === "font-family-picker") return <FontFamilyPicker />;
    if (floatingControl === "text-preset-picker") return <TextPresetPicker trackItem={trackItem} />;
    if (floatingControl === "animation-picker") return <AnimationPicker animationType={trackItem.type === "text" ? "text" : undefined} />;
    if (floatingControl === "animation-caption") return <AnimationCaption />;
    if (floatingControl === "caption-preset-picker") return <CaptionPresetPicker trackItem={trackItem} />;
    return null;
  })();

  return (
    <AnimatePresence mode="wait">
      {controlContent && (
        <motion.div
          key={floatingControl}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          {controlContent}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
