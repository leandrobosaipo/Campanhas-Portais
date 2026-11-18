"use strict";

function requireHttpUrl(value, name) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must use HTTP or HTTPS`);
  }
  return parsed.href;
}

async function preparePreviewMedia(page, mediaUrl) {
  const checks = [];
  let problem = null;
  const inspect = (response) => {
    let request = response.request();
    while (request.redirectedFrom()) request = request.redirectedFrom();
    if (request.url() !== mediaUrl) return;
    checks.push(
      (async () => {
        const headers = await response.allHeaders();
        const total = Number(
          headers["content-range"]?.split("/").at(-1) ||
            headers["content-length"] ||
            0,
        );
        if (
          response.status() === 413 ||
          headers["x-adops-preview-error"] === "preview_media_too_large" ||
          total > 20 * 1024 * 1024
        ) {
          problem = "preview_media_too_large";
          return;
        }
        try {
          if ((await response.body()).length > 20 * 1024 * 1024)
            problem = "preview_media_too_large";
        } catch {}
      })(),
    );
  };
  page.on("response", inspect);
  let handle;
  try {
    handle = await page.evaluateHandle(async (src) => {
      const videoFirst = /\.(mp4|webm|ogv|ogg|mov|m4v)(?:$|[?#])/i.test(src);
      if (!videoFirst) {
        const image = new Image();
        const loaded = new Promise((resolve) => {
          image.onload = () => resolve(true);
          image.onerror = () => resolve(false);
          setTimeout(() => resolve(false), 10000);
        });
        image.src = src;
        if ((await loaded) && image.naturalWidth > 0) {
          await image.decode().catch(() => {});
          return image;
        }
      }
      const video = document.createElement("video");
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.controls = false;
      const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("preview_video_codec_unsupported_or_unavailable")),
          15000,
        );
        video.addEventListener(
          "loadeddata",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
        video.addEventListener(
          "error",
          () => {
            clearTimeout(timer);
            reject(Error("preview_video_codec_unsupported_or_unavailable"));
          },
          { once: true },
        );
      });
      video.src = src;
      video.load();
      await ready;
      if (
        !video.videoWidth ||
        !video.videoHeight ||
        !Number.isFinite(video.duration) ||
        video.duration <= 0
      )
        throw Error("preview_video_codec_unsupported_or_unavailable");
      video.pause();
      if (video.readyState < 2) throw Error("preview_video_frame_unavailable");
      video.dataset.previewFrameTime = String(video.currentTime);
      return video;
    }, mediaUrl);
    await Promise.all(checks);
    if (problem) throw Error(problem);
    return {
      handle,
      checkSize: async () => {
        await Promise.all(checks);
        if (problem) throw Error(problem);
      },
      cleanup: async () => {
        page.off("response", inspect);
        await handle.dispose();
      },
    };
  } catch (error) {
    page.off("response", inspect);
    await Promise.all(checks);
    await handle?.dispose();
    if (problem) throw Error(problem);
    throw error;
  }
}

async function renderVisualSlotPreview({
  page,
  pageUrl,
  site,
  groupId,
  slotSelector,
  fallbackAnchorSelector,
  mediaUrl,
  clickUrl,
  outputPath,
  width,
  height,
}) {
  if (!page || typeof page.goto !== "function")
    throw new Error("page is required");
  if (typeof slotSelector !== "string" || !slotSelector.trim())
    throw new Error("slotSelector is required");
  if (typeof outputPath !== "string" || !outputPath.trim())
    throw new Error("outputPath is required");
  for (const [name, value] of [
    ["width", width],
    ["height", height],
  ]) {
    if (!Number.isInteger(value) || value < 1 || value > 10000)
      throw new Error(`${name} must be an integer from 1 to 10000`);
  }
  const safePageUrl = requireHttpUrl(pageUrl, "pageUrl");
  const safeMediaUrl = requireHttpUrl(mediaUrl, "mediaUrl");
  const safeClickUrl = clickUrl ? requireHttpUrl(clickUrl, "clickUrl") : null;

  await page.setViewportSize({ width, height });
  await page.goto(safePageUrl, { waitUntil: "domcontentloaded" });
  let matches = await page.locator(slotSelector).count();
  const responsiveRooHeader =
    matches > 1 && site === "ROO" && Number(groupId) === 1 &&
    slotSelector === ".g.g-1" && new URL(safePageUrl).pathname === "/";
  let reconstructed = false;
  let resolvedSelector = slotSelector;
  if (!responsiveRooHeader && matches !== 1 && !(matches === 0 && fallbackAnchorSelector))
    throw new Error(
      `slotSelector must match exactly one element; found ${matches}`,
    );
  if (
    matches === 0 &&
    (await page.locator(fallbackAnchorSelector).count()) !== 1
  )
    throw new Error("fallbackAnchorSelector must match exactly one element");
  const prepared = await preparePreviewMedia(page, safeMediaUrl);
  const preparedMedia = prepared.handle;
  let responsiveSlot;
  try {
    if (responsiveRooHeader) {
      // The portal renders the same widget in independent mobile/desktop wrappers.
      // Keep the actual DOM node; a locator could silently resolve to its sibling after a resize.
      const validateResponsivePair = () => {
        const slots = [...document.querySelectorAll(".g.g-1")];
        const mobile = slots.filter(el => el.closest(".cod5-mobile-banner-before-topbar #block-8"));
        const desktop = slots.filter(el => el.closest("header.omt-header #block-8"));
        if (slots.length !== 2 || mobile.length !== 1 || desktop.length !== 1 || mobile[0] === desktop[0])
          throw Error("slotSelector ROO responsive pair changed");
        const displayed = el => {
          for (let p = el; p; p = p.parentElement)
            if (getComputedStyle(p).display === "none") return false;
          return true;
        };
        const available = slots.filter(displayed);
        if (available.length !== 1 || !available[0].checkVisibility({ checkVisibilityCSS: true, checkOpacity: true }))
          throw Error("slotSelector ROO requires exactly one visible responsive widget");
        const rect = available[0].getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) throw Error("slotSelector ROO widget has no visible geometry");
        return available[0];
      };
      responsiveSlot = await page.evaluateHandle(validateResponsivePair);
      matches = 1;
    }
    if (matches === 0 && fallbackAnchorSelector) {
      if (
        typeof fallbackAnchorSelector !== "string" ||
        !fallbackAnchorSelector.trim()
      )
        throw new Error("fallbackAnchorSelector must be a non-empty selector");
      const anchorLocator = page.locator(fallbackAnchorSelector);
      const anchorCount = await anchorLocator.count();
      if (anchorCount !== 1)
        throw new Error(
          `fallbackAnchorSelector must match exactly one element; found ${anchorCount}`,
        );
      const marker = `visual-preview-slot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await anchorLocator.evaluate(
        async (anchor, { markerValue, media }) => {
          let rect = anchor.getBoundingClientRect();
          if (
            rect.width <= 0 &&
            getComputedStyle(anchor).display !== "none" &&
            anchor.parentElement?.getBoundingClientRect().width > 0
          ) {
            anchor.style.width = `${Math.min(media.videoWidth || media.naturalWidth, anchor.parentElement.getBoundingClientRect().width)}px`;
            anchor.style.maxWidth = "100%";
            anchor.dataset.visualPreviewAnchorSizedFromMedia = "true";
            rect = anchor.getBoundingClientRect();
          }
          if (rect.width <= 0)
            throw new Error("fallback anchor has no measurable width");
          const slot = document.createElement("div");
          slot.dataset.visualPreviewReconstructed = "true";
          slot.dataset.visualPreviewMarker = markerValue;
          slot.style.cssText = `width:${rect.width}px;${rect.height > 0 ? `height:${rect.height}px;` : "height:auto;"}position:relative;overflow:hidden;box-sizing:border-box;`;
          anchor.append(slot);
        },
        { markerValue: marker, media: preparedMedia },
      );
      resolvedSelector = `[data-visual-preview-marker="${marker}"]`;
      matches = await page.locator(resolvedSelector).count();
      reconstructed = true;
    }
    if (matches !== 1)
      throw new Error(
        `slotSelector must match exactly one element; found ${matches}`,
      );

    const slotLocator = responsiveSlot ? responsiveSlot.asElement() : page.locator(resolvedSelector);
    await slotLocator.scrollIntoViewIfNeeded();
    const layout = await slotLocator.evaluate(
      async (slot, { media, clickUrl: href, responsive }) => {
        if (responsive && (!slot.isConnected || !slot.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true }) ||
            [...document.querySelectorAll(".g.g-1")].filter(el => el.checkVisibility()).length !== 1))
          throw Error("slotSelector ROO responsive target changed before injection");
        const rect = slot.getBoundingClientRect();
        const reconstructedSlot =
          slot.dataset.visualPreviewReconstructed === "true";
        if (rect.width <= 0)
          throw new Error("target slot has no visible layout width");
        const autoHeight = rect.height <= 0;
        if (autoHeight) slot.style.height = "auto";
        const style = getComputedStyle(slot);
        if (style.position === "static") slot.style.position = "relative";
        slot.replaceChildren();
        slot.style.overflow = "hidden";

        const anchor = document.createElement(href ? "a" : "div");
        if (href) {
          anchor.href = href;
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
        }
        anchor.setAttribute("aria-label", "Prévia de anúncio não publicada");
        anchor.style.cssText = autoHeight
          ? "display:block;width:100%;height:auto;"
          : "display:block;width:100%;height:100%;";
        const image = media;
        image.alt = "Prévia de anúncio";
        image.style.cssText = autoHeight
          ? "display:block;width:100%;height:auto;object-fit:contain;"
          : "display:block;width:100%;height:100%;object-fit:contain;";
        anchor.append(image);
        slot.append(anchor);

        if (image.tagName === "VIDEO") {
          // Attaching a detached media element can reset its playback position in Chromium.
          // Seek only after the real slot contains it, then allow the decoded frame to paint.
          await new Promise((resolve, reject) => {
            const timer = setTimeout(
              () =>
                reject(Error("preview_video_codec_unsupported_or_unavailable")),
              15000,
            );
            image.addEventListener(
              "loadeddata",
              () => {
                clearTimeout(timer);
                resolve();
              },
              { once: true },
            );
            image.addEventListener(
              "error",
              () => {
                clearTimeout(timer);
                reject(Error("preview_video_codec_unsupported_or_unavailable"));
              },
              { once: true },
            );
            image.load();
          });
          await new Promise((resolve, reject) => {
            const timer = setTimeout(
              () => reject(Error("preview_video_frame_unavailable")),
              10000,
            );
            image.addEventListener(
              "seeked",
              () => {
                clearTimeout(timer);
                resolve();
              },
              { once: true },
            );
            image.addEventListener(
              "error",
              () => {
                clearTimeout(timer);
                reject(Error("preview_video_codec_unsupported_or_unavailable"));
              },
              { once: true },
            );
            image.currentTime = Math.min(1, image.duration / 2);
          });
          const targetTime = Math.min(1, image.duration / 2);
          if (Math.abs(image.currentTime - targetTime) > 0.1) {
            await new Promise((resolve, reject) => {
              const timer = setTimeout(
                () => reject(Error("preview_video_frame_unavailable")),
                10000,
              );
              const check = () => {
                if (image.currentTime >= targetTime) {
                  clearTimeout(timer);
                  image.removeEventListener("timeupdate", check);
                  resolve();
                }
              };
              image.addEventListener("timeupdate", check);
              image
                .play()
                .then(check)
                .catch(() => {
                  clearTimeout(timer);
                  reject(Error("preview_video_frame_unavailable"));
                });
            });
          }
          image.pause();
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          if (image.readyState < 2)
            throw Error("preview_video_frame_unavailable");
        }

        const naturalWidth = image.videoWidth || image.naturalWidth,
          naturalHeight = image.videoHeight || image.naturalHeight;
        if (autoHeight && slot.getBoundingClientRect().height <= 0) {
          slot.style.height = `${(slot.getBoundingClientRect().width * naturalHeight) / naturalWidth}px`;
        }

        const label = document.createElement("div");
        label.textContent = "PRÉVIA NÃO PUBLICADA";
        label.setAttribute("data-visual-slot-preview-label", "true");
        label.style.cssText =
          "position:absolute;z-index:2147483647;top:0;left:0;padding:6px 10px;background:#a40000;color:#fff;font:700 14px/1.2 Arial,sans-serif;letter-spacing:.04em;pointer-events:none;";
        slot.append(label);
        slot.scrollIntoView({ block: "center", inline: "nearest" });
        const finalRect = slot.getBoundingClientRect();
        if (
          finalRect.height > window.innerHeight ||
          finalRect.width > window.innerWidth ||
          finalRect.bottom <= 0 ||
          finalRect.top >= window.innerHeight
        )
          throw new Error("preview slot cannot fit in viewport");
        return {
          x: finalRect.x,
          y: finalRect.y,
          width: finalRect.width,
          height: finalRect.height,
          top: finalRect.top,
          right: finalRect.right,
          bottom: finalRect.bottom,
          left: finalRect.left,
          imageWidth: naturalWidth,
          imageHeight: naturalHeight,
          mediaComplete:
            image.tagName === "VIDEO" ? image.readyState >= 2 : image.complete,
          mediaKind: image.tagName === "VIDEO" ? "video" : "image",
          frameTime: image.tagName === "VIDEO" ? image.currentTime : null,
          duration: image.tagName === "VIDEO" ? image.duration : null,
        };
      },
      { media: preparedMedia, clickUrl: safeClickUrl, responsive: Boolean(responsiveSlot) },
    );

    // Materialize only image URLs already supplied by the portal, without executing its scripts.
    // The API runner's request interceptor applies the same public-IP policy to these resources.
    const contextImages = await page.evaluate(async () => {
      const images = [...document.images]
        .filter((image) => {
          const r = image.getBoundingClientRect();
          return (
            image.classList.contains("custom-logo") ||
            (r.width > 0 &&
              r.height > 0 &&
              r.bottom > 0 &&
              r.top < innerHeight &&
              r.right > 0 &&
              r.left < innerWidth)
          );
        })
        .slice(0, 40);
      await Promise.all(
        images.map(
          (image) =>
            new Promise((resolve) => {
              const source =
                image.getAttribute("data-lazy-src-webp") ||
                image.getAttribute("data-lazy-src") ||
                image.getAttribute("data-src");
              const srcset =
                image.getAttribute("data-lazy-srcset-webp") ||
                image.getAttribute("data-lazy-srcset") ||
                image.getAttribute("data-srcset");
              image.loading = "eager";
              if (source) {
                try {
                  const u = new URL(source, document.baseURI);
                  if (["http:", "https:"].includes(u.protocol))
                    image.src = u.href;
                } catch {}
              }
              if (srcset) image.srcset = srcset;
              const sizes = image.getAttribute("data-lazy-sizes");
              if (sizes) image.sizes = sizes;
              if (image.complete && image.naturalWidth > 0) {
                resolve();
                return;
              }
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
              setTimeout(resolve, 5000);
            }),
        ),
      );
      return {
        selected: images.length,
        loaded: images.filter(
          (image) => image.complete && image.naturalWidth > 0,
        ).length,
      };
    });
    await prepared.checkSize();
    if (responsiveSlot && !(await responsiveSlot.evaluate(el => el.isConnected &&
        el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true }) &&
        el.querySelector('[data-visual-slot-preview-label="true"]') !== null &&
        [...document.querySelectorAll(".g.g-1")].filter(node => node.checkVisibility()).length === 1)))
      throw Error("slotSelector ROO responsive target changed before screenshot");
    await page.screenshot({ path: outputPath, type: "png", fullPage: false });
    return {
      outputPath,
      pageUrl: safePageUrl,
      slotSelector,
      width,
      height,
      screenshot: { width, height, scope: "viewport" },
      layout,
      contextImages,
      reconstructed,
      fallbackAnchorSelector: reconstructed
        ? fallbackAnchorSelector
        : undefined,
      published: false,
    };
  } catch (error) {
    await prepared.checkSize();
    throw error;
  } finally {
    if (responsiveSlot) await responsiveSlot.dispose();
    await prepared.cleanup();
  }
}

module.exports = { renderVisualSlotPreview };
