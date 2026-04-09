"use client";

import dynamic from "next/dynamic";

const Editor = dynamic(() => import("@/editor_runtime/features/editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center" style={{ backgroundColor: "#060810" }}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
    </div>
  )
});

type EditorClientProps = {
  id?: string;
};

export default function EditorClient({ id }: EditorClientProps) {
  return <Editor id={id} />;
}
