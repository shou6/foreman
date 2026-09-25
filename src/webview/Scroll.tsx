import { OverlayScrollbars, type PartialOptions } from 'overlayscrollbars';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

/**
 * スクロールバーは内側に重ねて出す（OverlayScrollbars）。バーの有無で中身の幅が変わらない。
 * 色は VS Code のスクロールバーに合わせる（styles.css の .os-theme-foreman）
 */
const OPTIONS: PartialOptions = {
  scrollbars: { theme: 'os-theme-foreman', autoHide: 'leave', autoHideDelay: 400 },
};

interface ScrollProps {
  /** 外枠の class。大きさの上限、背景、余白はこちらに付ける */
  class: string;
  /** スクロールする要素のタグ */
  as?: 'div' | 'pre';
  viewportClass?: string;
  /** スクロールする要素の中身を HTML で渡す時（Markdown） */
  html?: string;
  /** スクロールする要素を受け取る（末尾まで送る時など） */
  onViewport?: (viewport: HTMLElement) => void;
  children?: ComponentChildren;
}

/**
 * スクロールする領域。外枠の中に、スクロールする要素を Preact が描く。
 * OverlayScrollbars には両方を渡し、要素を作らせない（Preact の管理する DOM を動かさない）
 */
export function Scroll({
  class: cls,
  as: Tag = 'div',
  viewportClass,
  html,
  onViewport,
  children,
}: ScrollProps) {
  const host = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLElement>(null);
  useEffect(() => {
    if (host.current === null || viewport.current === null) {
      return;
    }
    const instance = OverlayScrollbars(
      {
        target: host.current,
        elements: { viewport: viewport.current, padding: false, content: false },
      },
      OPTIONS
    );
    onViewport?.(viewport.current);
    return () => instance.destroy();
  }, []);
  return (
    <div class={'scroll ' + cls} ref={host}>
      {html !== undefined ? (
        <Tag
          class={viewportClass}
          ref={viewport as never}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <Tag class={viewportClass} ref={viewport as never}>
          {children}
        </Tag>
      )}
    </div>
  );
}

/**
 * Markdown（HTML で描く部分）の中のコードブロックにも、同じスクロールバーを付ける。
 * 中身は Preact が管理しないので、要素ごと OverlayScrollbars に任せる。消えた要素の分は片付ける
 */
export function enhanceScrollbars(root: HTMLElement, selector = '.markdown pre'): () => void {
  const instances = new Map<Element, OverlayScrollbars>();
  const scan = (): void => {
    for (const [element, instance] of instances) {
      if (!element.isConnected) {
        instance.destroy();
        instances.delete(element);
      }
    }
    for (const element of root.querySelectorAll<HTMLElement>(selector)) {
      if (!instances.has(element)) {
        instances.set(element, OverlayScrollbars(element, OPTIONS));
      }
    }
  };
  const observer = new MutationObserver(scan);
  observer.observe(root, { childList: true, subtree: true });
  scan();
  return () => {
    observer.disconnect();
    for (const instance of instances.values()) {
      instance.destroy();
    }
    instances.clear();
  };
}
