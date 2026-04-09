import dynamic from "next/dynamic";
import useLayoutStore from "../store/use-layout-store";

const Transitions = dynamic(
  () => import("./transitions").then((mod) => mod.Transitions),
  { loading: () => null }
);
const Texts = dynamic(() => import("./texts").then((mod) => mod.Texts), {
  loading: () => null
});
const Audios = dynamic(() => import("./audios").then((mod) => mod.Audios), {
  loading: () => null
});
const Elements = dynamic(
  () => import("./elements").then((mod) => mod.Elements),
  { loading: () => null }
);
const Images = dynamic(() => import("./images").then((mod) => mod.Images), {
  loading: () => null
});
const Animations = dynamic(
  () => import("./animations").then((mod) => mod.Animations),
  { loading: () => null }
);
const Videos = dynamic(() => import("./videos").then((mod) => mod.Videos), {
  loading: () => null
});
const Captions = dynamic(
  () => import("./captions").then((mod) => mod.Captions),
  { loading: () => null }
);
const VoiceOver = dynamic(
  () => import("./voice-over").then((mod) => mod.VoiceOver),
  { loading: () => null }
);
const Uploads = dynamic(() => import("./uploads").then((mod) => mod.Uploads), {
  loading: () => null
});
const AiVoice = dynamic(
  () => import("./ai-voice").then((mod) => mod.AiVoice),
  { loading: () => null }
);
const SFX = dynamic(() => import("./sfx").then((mod) => mod.SFX), {
  loading: () => null
});

const ActiveMenuItem = () => {
  const { activeMenuItem } = useLayoutStore();

  if (activeMenuItem === "transitions") {
    return <Transitions />;
  }
  if (activeMenuItem === "texts") {
    return <Texts />;
  }
  if (activeMenuItem === "shapes") {
    return <Elements />;
  }
  if (activeMenuItem === "videos") {
    return <Videos />;
  }
  if (activeMenuItem === "captions") {
    return <Captions />;
  }

  if (activeMenuItem === "audios") {
    return <Audios />;
  }

  if (activeMenuItem === "images") {
    return <Images />;
  }

  if (activeMenuItem === "animations") {
    return <Animations />;
  }

  if (activeMenuItem === "voiceOver") {
    return <VoiceOver />;
  }
  if (activeMenuItem === "elements") {
    return <Elements />;
  }
  if (activeMenuItem === "uploads") {
    return <Uploads />;
  }

  if (activeMenuItem === "ai-voice") {
    return <AiVoice />;
  }

  if (activeMenuItem === "sfx") {
    return <SFX />;
  }

  return null;
};

export const MenuItem = () => {
  return (
    <div className={`w-full flex-1 flex h-[calc(100%-50px)]`}>
      <ActiveMenuItem />
    </div>
  );
};
