(() => {
  "use strict";

  function isMobile() {
    return navigator.userAgentData?.mobile === true ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  // One generated result is shared by preview, explicit save and explicit share.
  function create(blob, filename) {
    if (!(blob instanceof Blob) || !blob.size) throw new Error("图片生成失败");
    const file = new File([blob], filename, { type: blob.type });
    const url = URL.createObjectURL(blob);
    let disposed = false;
    const canShare = () => {
      if (disposed || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
      try { return navigator.canShare({ files: [file] }); } catch { return false; }
    };
    return Object.freeze({
      file, url, canShare,
      previewURL() {
        if (!isMobile()) return Promise.resolve(url);
        // Re-encode the same bytes as an inline image, without re-rendering.
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error || new Error("预览图片读取失败"));
          reader.readAsDataURL(blob);
        });
      },
      save() {
        if (disposed) return "cancelled";
        // A browser download targets Files/Downloads, not the phone photo library.
        download(blob, filename);
        return "downloaded";
      },
      async share() {
        if (!canShare()) return "unsupported";
        try {
          await navigator.share({ files: [file] });
          return "shared";
        } catch (error) {
          if (error.name === "AbortError") return "cancelled";
          throw error;
        }
      },
      dispose() {
        if (!disposed) URL.revokeObjectURL(url);
        disposed = true;
      },
    });
  }

  window.QuestMakerExport = Object.freeze({ create });
})();
