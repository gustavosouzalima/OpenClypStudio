import type { RendererLike } from "../renderer-types";

export type BaseNodeParams = object | undefined;

export class BaseNode<Params extends BaseNodeParams = BaseNodeParams> {
  params: Params;

  constructor(params?: Params) {
    this.params = params ?? ({} as Params);
  }

  children: BaseNode[] = [];

  add(child: BaseNode) {
    this.children.push(child);
    return this;
  }

  remove(child: BaseNode) {
    this.children = this.children.filter((c) => c !== child);
    return this;
  }

  async render({
    renderer,
    time,
  }: {
    renderer: RendererLike;
    time: number;
  }): Promise<void> {
    for (const child of this.children) {
      await child.render({ renderer, time });
    }
  }
}
