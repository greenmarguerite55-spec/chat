(function () {
  if (window.__cgptAnnotatorLoaded) {
    return;
  }
  window.__cgptAnnotatorLoaded = true;

  const STORAGE_PREFIX = "cgpt-annotator::";
  const ROOT_ID = "cgpt-annotator-root";
  const HIGHLIGHT_CLASS = "cgpt-annotator-highlight";
  const MARKER_CLASS = "cgpt-annotator-marker";
  const COLOR_OPTIONS = [
    { name: "gold", value: "#fbbf24", background: "rgba(251, 191, 36, 0.34)" },
    { name: "coral", value: "#fb7185", background: "rgba(251, 113, 133, 0.30)" },
    { name: "mint", value: "#34d399", background: "rgba(52, 211, 153, 0.28)" },
    { name: "sky", value: "#38bdf8", background: "rgba(56, 189, 248, 0.28)" },
    { name: "violet", value: "#a78bfa", background: "rgba(167, 139, 250, 0.28)" }
  ];

  const state = {
    href: location.href,
    annotations: [],
    pendingRange: null,
    pendingLeftSelectionRange: null,
    pendingLeftSelectionRects: [],
    skipNextPendingSelectionClick: false,
    pendingLeftSelectionCapturedAt: 0,
    pendingLeftSelectionPoint: null,
    selectedColor: COLOR_OPTIONS[0].name,
    activeAnnotationId: null,
    editingAnnotationId: null,
    lastContextPoint: null,
    contextRange: null,
    dom: {},
    railTimer: null,
    reloadTimer: null,
    toolbarDrag: null,
    colorPickerOpen: false,
    selectionPromptColorPickerOpen: false,
    selectionPromptDrag: null,
    popoverDrag: null,
    popoverAnnotationIds: [],
    popoverSelectedId: null,
    booted: false
  };

  init();

  function init() {
    ensureUi();
    bindEvents();
    bootstrapWhenReady();
  }

  function bootstrapWhenReady() {
    if (state.booted) {
      return;
    }

    if (getConversationRoot()) {
      state.booted = true;
      reloadAnnotations();
      return;
    }

    const observer = new MutationObserver(() => {
      if (!getConversationRoot()) {
        return;
      }
      observer.disconnect();
      state.booted = true;
      reloadAnnotations();
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function getConversationRoot() {
    return document.querySelector("main");
  }

  function getEventElementTarget(event) {
    if (!event || !event.target) {
      return null;
    }
    return event.target.nodeType === Node.TEXT_NODE ? event.target.parentElement : event.target;
  }

  function ensureUi() {
    if (state.dom.root && document.body.contains(state.dom.root)) {
      return;
    }

    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML = [
      '<div id="cgpt-annotator-toolbar" hidden>',
      '  <div class="cgpt-annotator-panel-top">',
      '    <p id="cgpt-annotator-toolbar-title" class="cgpt-annotator-heading">Add annotation</p>',
      '    <button id="cgpt-annotator-color-trigger" class="cgpt-annotator-color-trigger" type="button" aria-label="Current highlight color"></button>',
      '  </div>',
      '  <div id="cgpt-annotator-color-popover" class="cgpt-annotator-color-popover" data-role="colors" hidden></div>',
      '  <input id="cgpt-annotator-title" type="text" placeholder="Title (optional)">',
      '  <textarea id="cgpt-annotator-note" placeholder="Write a note (optional)"></textarea>',
      '  <div class="cgpt-annotator-action-row">',
      '    <button class="cgpt-annotator-btn cgpt-annotator-btn-secondary" data-action="cancel">Cancel</button>',
      '    <button id="cgpt-annotator-save" class="cgpt-annotator-btn cgpt-annotator-btn-primary" data-action="save">Save</button>',
      '  </div>',
      '  <p id="cgpt-annotator-toolbar-subtle" class="cgpt-annotator-subtle">Confirm the highlight, then add a title and note.</p>',
      '</div>',
      '<div id="cgpt-annotator-selection-prompt" hidden>',
      '  <div class="cgpt-annotator-panel-top cgpt-annotator-selection-top">',
      '    <p class="cgpt-annotator-selection-copy">Add annotation?</p>',
      '    <button id="cgpt-annotator-selection-color-trigger" class="cgpt-annotator-selection-color" data-action="toggle-selection-colors" aria-label="Choose highlight color"></button>',
      '  </div>',
      '  <div id="cgpt-annotator-selection-color-popover" class="cgpt-annotator-selection-color-popover" data-role="selection-colors" hidden></div>',
      '  <div class="cgpt-annotator-selection-actions">',
      '    <button class="cgpt-annotator-btn cgpt-annotator-btn-secondary" data-action="cancel-selection">Cancel</button>',
      '    <button class="cgpt-annotator-btn cgpt-annotator-btn-primary" data-action="open-selection-editor">Edit</button>',
      '  </div>',
      '</div>',
      '<div id="cgpt-annotator-popover" hidden></div>',
      '<div id="cgpt-annotator-rail" aria-label="Annotation rail"></div>'
    ].join("");

    document.body.appendChild(root);

    state.dom.root = root;
    state.dom.toolbar = root.querySelector("#cgpt-annotator-toolbar");
    state.dom.selectionPrompt = root.querySelector("#cgpt-annotator-selection-prompt");
    state.dom.toolbarTitle = root.querySelector("#cgpt-annotator-toolbar-title");
    state.dom.toolbarSubtle = root.querySelector("#cgpt-annotator-toolbar-subtle");
    state.dom.saveButton = root.querySelector("#cgpt-annotator-save");
    state.dom.colorTrigger = root.querySelector("#cgpt-annotator-color-trigger");
    state.dom.selectionColorTrigger = root.querySelector("#cgpt-annotator-selection-color-trigger");
    state.dom.titleInput = root.querySelector("#cgpt-annotator-title");
    state.dom.noteInput = root.querySelector("#cgpt-annotator-note");
    state.dom.colors = root.querySelector('[data-role="colors"]');
    state.dom.selectionColors = root.querySelector('[data-role="selection-colors"]');
    state.dom.popover = root.querySelector("#cgpt-annotator-popover");
    state.dom.rail = root.querySelector("#cgpt-annotator-rail");

    COLOR_OPTIONS.forEach((color) => {
      const toolbarButton = document.createElement("button");
      toolbarButton.type = "button";
      toolbarButton.className = "cgpt-annotator-color-btn";
      toolbarButton.dataset.color = color.name;
      toolbarButton.title = color.name;
      toolbarButton.style.background = color.value;
      if (color.name === state.selectedColor) {
        toolbarButton.classList.add("is-selected");
      }
      state.dom.colors.appendChild(toolbarButton);

      const promptButton = document.createElement("button");
      promptButton.type = "button";
      promptButton.className = "cgpt-annotator-color-btn";
      promptButton.dataset.color = color.name;
      promptButton.title = color.name;
      promptButton.style.background = color.value;
      if (color.name === state.selectedColor) {
        promptButton.classList.add("is-selected");
      }
      state.dom.selectionColors.appendChild(promptButton);
    });

    syncSelectedColor();
  }

  function bindEvents() {
    state.dom.colors.addEventListener("click", (event) => {
      const target = getEventElementTarget(event);
      const button = target ? target.closest(".cgpt-annotator-color-btn") : null;
      if (!button) {
        return;
      }
      state.selectedColor = button.dataset.color;
      syncSelectedColor();
    });

    state.dom.selectionColors.addEventListener("click", (event) => {
      const target = getEventElementTarget(event);
      const button = target ? target.closest(".cgpt-annotator-color-btn") : null;
      if (!button) {
        return;
      }
      state.selectedColor = button.dataset.color;
      syncSelectedColor();
      setSelectionPromptColorPickerVisible(false);
    });

    state.dom.toolbar.addEventListener("click", async (event) => {
      const target = getEventElementTarget(event);
      const button = target ? target.closest("[data-action]") : null;
      const action = button ? button.dataset.action : null;
      if (action === "toggle-colors") {
        setColorPickerVisible(!state.colorPickerOpen);
        return;
      }
      if (action === "cancel") {
        hideToolbar();
        return;
      }
      if (action === "save") {
        await savePendingAnnotation();
      }
    });

    state.dom.selectionPrompt.addEventListener("click", (event) => {
      const target = getEventElementTarget(event);
      const button = target ? target.closest("[data-action]") : null;
      const action = button ? button.dataset.action : null;
      if (action === "toggle-selection-colors") {
        setSelectionPromptColorPickerVisible(!state.selectionPromptColorPickerOpen);
        return;
      }
      if (action === "cancel-selection") {
        hideSelectionPrompt(true);
        return;
      }
      if (action === "open-selection-editor") {
        confirmPendingSelection();
      }
    });

    state.dom.popover.addEventListener("click", async (event) => {
      const target = getEventElementTarget(event);
      const button = target ? target.closest("[data-action]") : null;
      if (!button) {
        return;
      }
      if (button.dataset.action === "select-annotation") {
        state.activeAnnotationId = button.dataset.id;
        syncActiveMarker();
        focusHighlightPieces(button.dataset.id, false);
        showPopover(state.popoverAnnotationIds, button.dataset.id, null, true);
        return;
      }
      if (button.dataset.action === "edit") {
        beginEditAnnotation(button.dataset.id);
        return;
      }
      if (button.dataset.action === "export-single") {
        exportSingleAnnotation(button.dataset.id);
        return;
      }
      if (button.dataset.action === "delete") {
        await deleteAnnotation(button.dataset.id);
      }
    });

    state.dom.toolbar.addEventListener("mousedown", (event) => {
      if (!shouldStartPanelDrag(event, state.dom.toolbar)) {
        return;
      }
      beginPanelDrag("toolbar", event, state.dom.toolbar);
    });

    state.dom.selectionPrompt.addEventListener("mousedown", (event) => {
      if (!shouldStartPanelDrag(event, state.dom.selectionPrompt)) {
        return;
      }
      beginPanelDrag("selectionPrompt", event, state.dom.selectionPrompt);
    });

    state.dom.popover.addEventListener("mousedown", (event) => {
      if (!shouldStartPanelDrag(event, state.dom.popover)) {
        return;
      }
      beginPanelDrag("popover", event, state.dom.popover);
    });

    window.addEventListener("mousemove", (event) => {
      updatePanelDrag(event);
    });

    window.addEventListener("mouseup", (event) => {
      endPanelDrag();
      if (event.button === 0) {
        capturePendingLeftSelection(event);
      }
    });

    document.addEventListener("mousedown", (event) => {
      const target = getEventElementTarget(event);
      if (target && state.dom.root.contains(target)) {
        return;
      }

      if (target && (target.closest(`.${HIGHLIGHT_CLASS}`) || target.closest(`.${MARKER_CLASS}`))) {
        return;
      }

      hidePopover();
      hideSelectionPrompt(true);
      if (event.button === 0 && !state.dom.toolbar.hidden) {
        hideToolbar();
      }
    }, true);

    document.addEventListener("click", (event) => {
      const target = getEventElementTarget(event);
      const marker = target ? target.closest(`.${MARKER_CLASS}`) : null;
      if (marker) {
        hideSelectionPrompt(true);
        event.preventDefault();
        openAnnotationCluster([marker.dataset.id], marker.dataset.id, null, true, true);
        return;
      }

      const highlight = target ? target.closest(`.${HIGHLIGHT_CLASS}`) : null;
      if (highlight) {
        hideSelectionPrompt(true);
        event.preventDefault();
        const annotationIds = collectAnnotationIdsAtTarget(target);
        if (!annotationIds.length) {
          return;
        }
        openAnnotationCluster(annotationIds, getNewestAnnotationId(annotationIds, highlight.dataset.annotationId), highlight, false, false);
        return;
      }

      if (state.skipNextPendingSelectionClick) {
        const withinGuardWindow = Date.now() - state.pendingLeftSelectionCapturedAt < 250;
        const samePoint = state.pendingLeftSelectionPoint
          ? Math.hypot(event.clientX - state.pendingLeftSelectionPoint.x, event.clientY - state.pendingLeftSelectionPoint.y) < 8
          : false;
        state.skipNextPendingSelectionClick = false;
        if (withinGuardWindow && samePoint) {
          return;
        }
      }

      if (event.button !== 0) {
        return;
      }

      if (target && state.dom.root.contains(target)) {
        return;
      }

      hideSelectionPrompt(true);
      clearPendingLeftSelection();
    }, true);

    window.addEventListener("resize", scheduleRailUpdate, true);
    window.setInterval(checkLocationChange, 900);

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message) {
        return;
      }
      if (message.type === "cgpt-get-popup-data") {
        sendResponse(getPopupData());
        return true;
      }
    });

    const observer = new MutationObserver(handleMutations);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  function getPopupData() {
    const isConversationPage = Boolean(getConversationRoot());
    const annotations = isConversationPage ? getAnnotationsInPageOrder().map(serializeAnnotation) : [];
    return {
      isConversationPage,
      title: normalizeWhitespace(document.title) || "ChatGPT Conversation",
      url: `${location.origin}${location.pathname}`,
      chatSlug: location.pathname.split("/").filter(Boolean).pop() || "chatgpt",
      noteCount: annotations.length,
      roundCount: isConversationPage ? countConversationRounds() : 0,
      annotations
    };
  }

  function countConversationRounds() {
    const root = getConversationRoot();
    if (!root) {
      return 0;
    }

    const userMessages = selectUniqueElements(root, [
      '[data-message-author-role="user"]',
      '[data-testid*="conversation-turn"] [data-message-author-role="user"]'
    ]);
    const assistantMessages = selectUniqueElements(root, [
      '[data-message-author-role="assistant"]',
      '[data-testid*="conversation-turn"] [data-message-author-role="assistant"]'
    ]);

    if (userMessages.length || assistantMessages.length) {
      return Math.max(userMessages.length, assistantMessages.length);
    }

    const articles = Array.from(root.querySelectorAll("article"));
    if (articles.length) {
      return Math.ceil(articles.length / 2);
    }

    const turns = Array.from(root.querySelectorAll('[data-testid*="conversation-turn"]'));
    if (turns.length) {
      return Math.ceil(turns.length / 2);
    }

    return 0;
  }

  function selectUniqueElements(root, selectors) {
    const seen = new Set();
    const results = [];
    selectors.forEach((selector) => {
      root.querySelectorAll(selector).forEach((node) => {
        if (seen.has(node)) {
          return;
        }
        seen.add(node);
        results.push(node);
      });
    });
    return results;
  }

  function getCurrentSelectionRange() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null;
    }

    const range = selection.getRangeAt(0).cloneRange();
    return isRangeAnnotatable(range) ? range : null;
  }

  function capturePendingLeftSelection(event) {
    const target = getEventElementTarget(event);
    if (target && target.closest(`#${ROOT_ID}`)) {
      return;
    }

    const range = getCurrentSelectionRange();
    if (!range) {
      hideSelectionPrompt(true);
      clearPendingLeftSelection();
      return;
    }

    state.pendingLeftSelectionRange = range.cloneRange();
    state.pendingLeftSelectionRects = Array.from(range.getClientRects()).map((rect) => ({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom
    }));
    state.pendingLeftSelectionCapturedAt = Date.now();
    state.pendingLeftSelectionPoint = { x: event.clientX, y: event.clientY };
    state.skipNextPendingSelectionClick = true;
    openSelectionPromptForRange(range, state.pendingLeftSelectionPoint);
  }

  function clearPendingLeftSelection() {
    state.pendingLeftSelectionRange = null;
    state.pendingLeftSelectionRects = [];
    state.skipNextPendingSelectionClick = false;
    state.pendingLeftSelectionCapturedAt = 0;
    state.pendingLeftSelectionPoint = null;
  }

  function openSelectionPromptForRange(range, point) {
    if (!range) {
      return;
    }

    hideToolbar();
    setSelectionPromptColorPickerVisible(false);
    syncSelectedColor();

    const prompt = state.dom.selectionPrompt;
    prompt.hidden = false;

    const width = Math.min(240, window.innerWidth - 24);
    let left = 12;
    let top = 12;

    if (point && typeof point.x === "number" && typeof point.y === "number") {
      left = clamp(point.x + 12, 12, window.innerWidth - width - 12);
      top = clamp(point.y + 12, 12, window.innerHeight - 140);
    } else {
      const rect = range.getBoundingClientRect();
      left = clamp(rect.left + rect.width / 2 - width / 2, 12, window.innerWidth - width - 12);
      top = rect.bottom + 10 < window.innerHeight - 140 ? rect.bottom + 10 : Math.max(12, rect.top - 96);
    }

    prompt.style.width = `${width}px`;
    prompt.style.left = `${left}px`;
    prompt.style.top = `${top}px`;
  }

  function hideSelectionPrompt(clearPending) {
    endSinglePanelDrag('selectionPrompt', state.dom.selectionPrompt);
    state.dom.selectionPrompt.hidden = true;
    setSelectionPromptColorPickerVisible(false);
    if (clearPending) {
      clearPendingLeftSelection();
    }
  }

  function confirmPendingSelection() {
    if (!state.pendingLeftSelectionRange) {
      hideSelectionPrompt(true);
      return;
    }

    const range = state.pendingLeftSelectionRange.cloneRange();
    const point = state.pendingLeftSelectionPoint
      ? { x: state.pendingLeftSelectionPoint.x, y: state.pendingLeftSelectionPoint.y }
      : null;

    hideSelectionPrompt(false);
    clearPendingLeftSelection();

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }

    openToolbarForRange(range, point, null);
  }

  function shouldStartPanelDrag(event, panel) {
    if (event.button !== 0) {
      return false;
    }
    if (!panel || panel.hidden) {
      return false;
    }
    const target = getEventElementTarget(event);
    if (!target) {
      return false;
    }
    return !target.closest('button, textarea, input, select, option, label, .cgpt-annotator-popover-selector, .cgpt-annotator-popover-body, .cgpt-annotator-popover-quote');
  }

  function beginPanelDrag(kind, event, panel) {
    const rect = panel.getBoundingClientRect();
    state[`${kind}Drag`] = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    panel.classList.add('is-dragging');
    event.preventDefault();
  }

  function updatePanelDrag(event) {
    updateSinglePanelDrag('toolbar', state.dom.toolbar, event);
    updateSinglePanelDrag('selectionPrompt', state.dom.selectionPrompt, event);
    updateSinglePanelDrag('popover', state.dom.popover, event);
  }

  function updateSinglePanelDrag(kind, panel, event) {
    const dragState = state[`${kind}Drag`];
    if (!dragState || !panel || panel.hidden) {
      return;
    }
    const width = panel.offsetWidth || 0;
    const height = panel.offsetHeight || 0;
    const left = clamp(event.clientX - dragState.offsetX, 12, Math.max(12, window.innerWidth - width - 12));
    const top = clamp(event.clientY - dragState.offsetY, 12, Math.max(12, window.innerHeight - height - 12));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function endPanelDrag() {
    endSinglePanelDrag('toolbar', state.dom.toolbar);
    endSinglePanelDrag('selectionPrompt', state.dom.selectionPrompt);
    endSinglePanelDrag('popover', state.dom.popover);
  }

  function endSinglePanelDrag(kind, panel) {
    if (!state[`${kind}Drag`]) {
      return;
    }
    state[`${kind}Drag`] = null;
    if (panel) {
      panel.classList.remove('is-dragging');
    }
  }

  function isRangeAnnotatable(range) {
    const root = getConversationRoot();
    if (!root) {
      return false;
    }

    const startNode = range.startContainer;
    const endNode = range.endContainer;
    if (!root.contains(startNode) || !root.contains(endNode)) {
      return false;
    }

    const text = normalizeWhitespace(range.toString());
    if (!text || text.length > 1000) {
      return false;
    }

    const startElement = startNode.nodeType === Node.TEXT_NODE ? startNode.parentElement : startNode;
    const endElement = endNode.nodeType === Node.TEXT_NODE ? endNode.parentElement : endNode;
    const blockedSelector = `#${ROOT_ID}, textarea, input, button, [contenteditable='true']`;

    return !(startElement && startElement.closest(blockedSelector)) && !(endElement && endElement.closest(blockedSelector));
  }


  function openToolbarForRange(range, point, annotation) {
    hideSelectionPrompt(false);
    clearPendingLeftSelection();
    state.pendingRange = range ? range.cloneRange() : null;
    state.editingAnnotationId = annotation ? annotation.id : null;
    state.selectedColor = annotation ? annotation.color : COLOR_OPTIONS[0].name;
    state.dom.titleInput.value = annotation ? (annotation.title || "") : "";
    state.dom.noteInput.value = annotation ? (annotation.note || "") : "";
    state.dom.toolbarTitle.textContent = annotation ? "Edit annotation" : "Add annotation";
    state.dom.toolbarSubtle.textContent = annotation
      ? "Update the title, note, or highlight color for this annotation."
      : "Confirm the highlight, then add a title and note.";
    state.dom.saveButton.textContent = annotation ? "Edit" : "Save";
    setColorPickerVisible(true);
    syncSelectedColor();

    const toolbar = state.dom.toolbar;
    toolbar.hidden = false;

    const width = Math.min(320, window.innerWidth - 24);
    let left = 12;
    let top = 12;

    if (point && typeof point.x === "number" && typeof point.y === "number") {
      left = clamp(point.x + 12, 12, window.innerWidth - width - 12);
      top = clamp(point.y + 12, 12, window.innerHeight - 280);
    } else if (range) {
      const rect = range.getBoundingClientRect();
      left = clamp(rect.left + rect.width / 2 - width / 2, 12, window.innerWidth - width - 12);
      top = rect.bottom + 10 < window.innerHeight - 280 ? rect.bottom + 10 : Math.max(12, rect.top - 280);
    }

    toolbar.style.width = `${width}px`;
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
    state.dom.titleInput.focus();
  }

  function hideToolbar() {
    endSinglePanelDrag('toolbar', state.dom.toolbar);
    state.pendingRange = null;
    state.editingAnnotationId = null;
    state.contextRange = null;
    state.lastContextPoint = null;
    state.dom.toolbar.hidden = true;
    state.dom.toolbarTitle.textContent = "Add annotation";
    state.dom.toolbarSubtle.textContent = "Confirm the highlight, then add a title and note.";
    state.dom.saveButton.textContent = "Save";
    state.dom.titleInput.value = "";
    state.dom.noteInput.value = "";
    state.selectedColor = COLOR_OPTIONS[0].name;
    setColorPickerVisible(false);
    syncSelectedColor();
  }

  function setColorPickerVisible(visible) {
    state.colorPickerOpen = Boolean(visible);
    if (state.dom.colors) {
      state.dom.colors.hidden = !state.colorPickerOpen;
    }
    if (state.dom.colorTrigger) {
      state.dom.colorTrigger.classList.toggle("is-open", state.colorPickerOpen);
    }
  }

  function setSelectionPromptColorPickerVisible(visible) {
    state.selectionPromptColorPickerOpen = Boolean(visible);
    if (state.dom.selectionColors) {
      state.dom.selectionColors.hidden = !state.selectionPromptColorPickerOpen;
    }
    if (state.dom.selectionColorTrigger) {
      state.dom.selectionColorTrigger.classList.toggle("is-open", state.selectionPromptColorPickerOpen);
    }
  }

  function syncSelectedColor() {
    state.dom.colors.querySelectorAll(".cgpt-annotator-color-btn").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.color === state.selectedColor);
    });
    state.dom.selectionColors.querySelectorAll(".cgpt-annotator-color-btn").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.color === state.selectedColor);
    });
    if (state.dom.colorTrigger) {
      state.dom.colorTrigger.style.background = getColorByName(state.selectedColor).value;
    }
    if (state.dom.selectionColorTrigger) {
      state.dom.selectionColorTrigger.style.background = getColorByName(state.selectedColor).value;
    }
  }

  async function savePendingAnnotation() {
    const title = state.dom.titleInput.value.trim();
    const note = state.dom.noteInput.value.trim();

    if (state.editingAnnotationId) {
      const updated = updateAnnotation(state.editingAnnotationId, state.selectedColor, title, note);
      hideToolbar();
      if (!updated) {
        return;
      }
      await persistAnnotations();
      syncHighlightDecorations();
      renderMarkers();
      scheduleRailUpdate();
      focusAnnotation(updated.id, false);
      return;
    }

    if (!state.pendingRange) {
      hideToolbar();
      return;
    }

    const annotation = createAnnotation(state.pendingRange, state.selectedColor, title, note);
    if (!annotation) {
      hideToolbar();
      return;
    }

    const applied = applyAnnotation(annotation, state.pendingRange.cloneRange());
    hideToolbar();

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }

    state.contextRange = null;
    state.lastContextPoint = null;

    if (!applied) {
      return;
    }

    state.annotations.push(annotation);
    await persistAnnotations();
    syncHighlightDecorations();
    renderMarkers();
    scheduleRailUpdate();
  }

  function beginEditAnnotation(annotationId) {
    const annotation = state.annotations.find((item) => item.id === annotationId);
    if (!annotation) {
      return;
    }

    const range = resolveAnnotationRange(annotation);
    const piece = getHighlightPieces(annotationId)[0];
    const point = piece
      ? { x: piece.getBoundingClientRect().right, y: piece.getBoundingClientRect().top }
      : null;

    hidePopover();
    openToolbarForRange(range, point, annotation);
  }

  function updateAnnotation(annotationId, colorName, title, note) {
    const annotation = state.annotations.find((item) => item.id === annotationId);
    if (!annotation) {
      return null;
    }

    annotation.color = colorName;
    annotation.title = title;
    annotation.note = note;
    annotation.updatedAt = new Date().toISOString();

    getHighlightPieces(annotation.id).forEach((piece) => {
      piece.dataset.color = annotation.color;
      piece.style.background = getColorByName(annotation.color).background;
    });
    syncHighlightDecorations();

    return annotation;
  }

  function createAnnotation(range, colorName, title, note) {
    const root = getConversationRoot();
    if (!root) {
      return null;
    }

    const linear = collectLinearText(root);
    const quote = range.toString();
    const startIndex = getTextOffset(linear.entries, range.startContainer, range.startOffset);
    const occurrence = getQuoteOccurrence(linear.text, quote, startIndex);
    const quoteIndex = nthIndexOf(linear.text, quote, occurrence);

    const quoteCenter = quoteIndex >= 0 ? quoteIndex + Math.max(quote.length, 1) / 2 : -1;
    const textPosition = quoteCenter >= 0
      ? clamp(quoteCenter / Math.max(linear.text.length, 1), 0, 1)
      : null;

    return {
      id: `ann-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      color: colorName,
      title,
      note,
      quote,
      occurrence,
      anchor: {
        startPath: getNodePath(root, range.startContainer),
        startOffset: range.startOffset,
        endPath: getNodePath(root, range.endContainer),
        endOffset: range.endOffset
      },
      context: {
        prefix: quoteIndex >= 0 ? linear.text.slice(Math.max(0, quoteIndex - 24), quoteIndex) : quote.slice(0, 24),
        suffix: quoteIndex >= 0 ? linear.text.slice(quoteIndex + quote.length, quoteIndex + quote.length + 24) : quote.slice(-24)
      },
      textPosition,
      snippet: normalizeWhitespace(title || quote).slice(0, 80),
      createdAt: new Date().toISOString()
    };
  }

  function collectLinearText(root) {
    const entries = [];
    let text = "";
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.parentElement && node.parentElement.closest(`#${ROOT_ID}`)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let current = walker.nextNode();
    while (current) {
      entries.push({
        node: current,
        start: text.length,
        end: text.length + current.textContent.length
      });
      text += current.textContent;
      current = walker.nextNode();
    }

    return { text, entries };
  }

  function getTextOffset(entries, node, offset) {
    const entry = entries.find((item) => item.node === node);
    return entry ? entry.start + offset : -1;
  }

  function getQuoteOccurrence(text, quote, startIndex) {
    if (!quote) {
      return 0;
    }

    let occurrence = 0;
    let searchStart = 0;
    while (searchStart <= text.length) {
      const index = text.indexOf(quote, searchStart);
      if (index === -1 || index > startIndex) {
        break;
      }
      occurrence += 1;
      searchStart = index + 1;
    }

    return Math.max(0, occurrence - 1);
  }

  function nthIndexOf(text, quote, occurrence) {
    if (!quote) {
      return -1;
    }

    let count = 0;
    let searchStart = 0;
    while (searchStart <= text.length) {
      const index = text.indexOf(quote, searchStart);
      if (index === -1) {
        return -1;
      }
      if (count === occurrence) {
        return index;
      }
      count += 1;
      searchStart = index + 1;
    }

    return -1;
  }


  function resolveAnnotationTextIndex(annotation, linear) {
    if (!linear || !annotation.quote) {
      return -1;
    }

    const matches = [];
    let searchStart = 0;
    while (searchStart <= linear.text.length) {
      const index = linear.text.indexOf(annotation.quote, searchStart);
      if (index === -1) {
        break;
      }
      matches.push(index);
      searchStart = index + 1;
    }

    if (!matches.length) {
      return -1;
    }

    const prefix = annotation.context?.prefix || "";
    const suffix = annotation.context?.suffix || "";
    const contextualMatch = matches.find((index) => {
      const prefixOk = !prefix || linear.text.slice(Math.max(0, index - prefix.length), index) === prefix;
      const suffixOk = !suffix || linear.text.slice(index + annotation.quote.length, index + annotation.quote.length + suffix.length) === suffix;
      return prefixOk || suffixOk;
    });

    if (typeof contextualMatch === "number") {
      return contextualMatch;
    }

    if (typeof annotation.occurrence === "number" && annotation.occurrence >= 0 && annotation.occurrence < matches.length) {
      return matches[annotation.occurrence];
    }

    return matches[0];
  }

  function getAnnotationTextRatio(annotation, linear) {
    const totalLength = Math.max(linear?.text?.length || 0, 1);
    const quoteIndex = resolveAnnotationTextIndex(annotation, linear);
    if (quoteIndex >= 0) {
      const ratio = clamp((quoteIndex + Math.max(annotation.quote.length, 1) / 2) / totalLength, 0, 1);
      annotation.textPosition = ratio;
      return ratio;
    }

    if (typeof annotation.textPosition === "number") {
      return clamp(annotation.textPosition, 0, 1);
    }

    return null;
  }

  function applyAnnotation(annotation, range) {
    const entries = collectTextEntries(range);
    if (!entries.length) {
      return false;
    }

    entries.forEach((entry) => {
      let target = entry.node;
      if (entry.start > 0) {
        target = target.splitText(entry.start);
      }

      const selectedLength = entry.end - entry.start;
      if (selectedLength < target.textContent.length) {
        target.splitText(selectedLength);
      }

      const span = document.createElement("span");
      span.className = HIGHLIGHT_CLASS;
      span.dataset.annotationId = annotation.id;
      span.dataset.color = annotation.color;
      target.parentNode.insertBefore(span, target);
      span.appendChild(target);
    });

    syncHighlightDecorations();
    return true;
  }

  function collectTextEntries(range) {
    const root = getConversationRoot();
    if (!root) {
      return [];
    }

    const entries = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent) {
          return NodeFilter.FILTER_REJECT;
        }
        if (node.parentElement && node.parentElement.closest(`#${ROOT_ID}`)) {
          return NodeFilter.FILTER_REJECT;
        }
        return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    let current = walker.nextNode();
    while (current) {
      const start = current === range.startContainer ? range.startOffset : 0;
      const end = current === range.endContainer ? range.endOffset : current.textContent.length;
      if (start !== end) {
        entries.push({ node: current, start, end });
      }
      current = walker.nextNode();
    }

    return entries;
  }

  function syncHighlightDecorations() {
    Array.from(document.querySelectorAll(`.${HIGHLIGHT_CLASS}`)).forEach((piece) => {
      const annotation = getAnnotationById(piece.dataset.annotationId);
      const chainColors = getHighlightChain(piece)
        .map((annotationId) => getAnnotationById(annotationId))
        .filter(Boolean)
        .map((item, index) => `inset 0 ${-(index * 2 + 1)}px 0 0 ${getColorByName(item.color).value}`);

      if (annotation) {
        piece.dataset.color = annotation.color;
        piece.style.background = getColorByName(annotation.color).background;
      }
      piece.style.boxShadow = chainColors.join(", ");
      piece.style.paddingBottom = `${Math.max(0, chainColors.length - 1) * 2}px`;
    });
  }

  function getHighlightChain(piece) {
    const ids = [];
    let current = piece;
    while (current && current !== document.body) {
      if (current.classList && current.classList.contains(HIGHLIGHT_CLASS)) {
        ids.unshift(current.dataset.annotationId);
      }
      current = current.parentElement;
    }
    return ids;
  }

  function renderMarkers() {
    state.dom.rail.querySelectorAll(`.${MARKER_CLASS}`).forEach((node) => node.remove());

    state.annotations.forEach((annotation) => {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = MARKER_CLASS;
      marker.dataset.id = annotation.id;
      marker.title = annotation.note || annotation.snippet || "Annotation";
      marker.style.background = getColorByName(annotation.color).value;
      state.dom.rail.appendChild(marker);
    });

    syncActiveMarker();
    scheduleRailUpdate();
  }

  function scheduleRailUpdate() {
    window.clearTimeout(state.railTimer);
    state.railTimer = window.setTimeout(updateRailPositions, 40);
  }

  function updateRailPositions() {
    const railHeight = state.dom.rail.clientHeight;
    const root = getConversationRoot();
    const linear = root ? collectLinearText(root) : { text: "", entries: [] };
    const positions = [];

    state.annotations.forEach((annotation, index) => {
      const marker = state.dom.rail.querySelector(`[data-id="${annotation.id}"]`);
      const piece = getHighlightPieces(annotation.id)[0];
      if (!marker || !piece) {
        if (marker) {
          marker.style.display = "none";
        }
        return;
      }

      const ratio = getAnnotationTextRatio(annotation, linear);
      if (typeof ratio !== "number") {
        marker.style.display = "none";
        return;
      }

      marker.style.display = "";
      positions.push({
        marker,
        index,
        top: clamp(ratio * railHeight, 10, Math.max(10, railHeight - 10))
      });
    });

    spreadMarkerPositions(positions, 14, 10, Math.max(10, railHeight - 10));
    positions.forEach((item) => {
      item.marker.style.top = `${item.top}px`;
    });
  }

  function spreadMarkerPositions(items, minGap, minTop, maxTop) {
    items.sort((left, right) => {
      if (left.top === right.top) {
        return left.index - right.index;
      }
      return left.top - right.top;
    });

    for (let index = 1; index < items.length; index += 1) {
      if (items[index].top - items[index - 1].top < minGap) {
        items[index].top = items[index - 1].top + minGap;
      }
    }

    if (items.length && items[items.length - 1].top > maxTop) {
      items[items.length - 1].top = maxTop;
      for (let index = items.length - 2; index >= 0; index -= 1) {
        items[index].top = Math.min(items[index].top, items[index + 1].top - minGap);
      }
    }

    items.forEach((item) => {
      item.top = clamp(item.top, minTop, maxTop);
    });
  }

  function openAnnotationCluster(annotationIds, selectedId, anchorElement, smoothScroll, preserveSelected) {
    const normalizedIds = normalizeAnnotationIds(annotationIds, selectedId);
    if (!normalizedIds.length) {
      return;
    }

    const finalSelectedId = preserveSelected && normalizedIds.includes(selectedId)
      ? selectedId
      : getNewestAnnotationId(normalizedIds, selectedId);
    const pieces = getHighlightPieces(finalSelectedId);
    if (!pieces.length) {
      return;
    }

    state.activeAnnotationId = finalSelectedId;
    syncActiveMarker();

    if (smoothScroll) {
      pieces[0].scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }

    focusHighlightPieces(finalSelectedId, true);
    const contextualIds = normalizedIds.length > 1
      ? normalizedIds
      : collectAnnotationIdsForPiece(pieces[0], finalSelectedId);
    showPopover(contextualIds, finalSelectedId, anchorElement || pieces[0], false);
  }

  function focusHighlightPieces(annotationId, animate) {
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}.is-focused`).forEach((piece) => {
      piece.classList.remove("is-focused");
    });

    getHighlightPieces(annotationId).forEach((piece) => {
      if (animate) {
        piece.classList.remove("is-focused");
        void piece.offsetWidth;
      }
      piece.classList.add("is-focused");
    });
  }

  function focusAnnotation(annotationId, smoothScroll) {
    openAnnotationCluster([annotationId], annotationId, getHighlightPieces(annotationId)[0] || null, smoothScroll, true);
  }

  function showPopover(annotationIds, selectedId, anchorElement, preservePosition) {
    const normalizedIds = normalizeAnnotationIds(annotationIds, selectedId);
    if (!normalizedIds.length) {
      hidePopover();
      return;
    }

    const selectedAnnotation = getAnnotationById(normalizedIds.includes(selectedId) ? selectedId : getNewestAnnotationId(normalizedIds));
    if (!selectedAnnotation) {
      hidePopover();
      return;
    }

    const popover = state.dom.popover;
    const keepPosition = preservePosition && !popover.hidden;
    const currentLeft = popover.style.left;
    const currentTop = popover.style.top;

    state.popoverAnnotationIds = normalizedIds;
    state.popoverSelectedId = selectedAnnotation.id;
    state.activeAnnotationId = selectedAnnotation.id;
    syncActiveMarker();

    const selectorHtml = normalizedIds.length > 1
      ? [
        '<div class="cgpt-annotator-popover-selector">',
        normalizedIds.map((annotationId, index) => {
          const annotation = getAnnotationById(annotationId);
          if (!annotation) {
            return "";
          }
          const selectedClass = annotationId === selectedAnnotation.id ? ' is-selected' : '';
          const summary = escapeHtml(normalizeWhitespace(annotation.title || annotation.note || annotation.quote || `Annotation ${index + 1}`));
          return [
            `<button class="cgpt-annotator-choice${selectedClass}" data-action="select-annotation" data-id="${annotation.id}">`,
            `  <span class="cgpt-annotator-choice-dot" style="background:${getColorByName(annotation.color).value}"></span>`,
            `  <span class="cgpt-annotator-choice-text">${summary || `Annotation ${index + 1}`}</span>`,
            '</button>'
          ].join("");
        }).join(""),
        '</div>'
      ].join("")
      : "";

    const titleSectionHtml = selectedAnnotation.title
      ? [
        '  <div class="cgpt-annotator-popover-section">',
        '    <p class="cgpt-annotator-popover-label">Title</p>',
        `    <div class="cgpt-annotator-popover-title-text">${escapeHtml(selectedAnnotation.title)}</div>`,
        '  </div>'
      ].join("")
      : "";

    const color = getColorByName(selectedAnnotation.color);
    popover.hidden = false;
    popover.innerHTML = [
      '<div class="cgpt-annotator-panel-top cgpt-annotator-popover-top">',
      '  <p class="cgpt-annotator-popover-title">',
      `    <span class="cgpt-annotator-popover-dot" style="background:${color.value}"></span>`,
      `    ${normalizedIds.length > 1 ? `${normalizedIds.length} annotations` : 'Annotation'}`,
      '  </p>',
      '</div>',
      selectorHtml,
      '<div class="cgpt-annotator-popover-content">',
      titleSectionHtml,
      '  <div class="cgpt-annotator-popover-section">',
      '    <p class="cgpt-annotator-popover-label">Highlight</p>',
      `    <p class="cgpt-annotator-popover-quote">${escapeHtml(selectedAnnotation.quote)}</p>`,
      '  </div>',
      '  <div class="cgpt-annotator-popover-section">',
      '    <p class="cgpt-annotator-popover-label">Note</p>',
      `    <div class="cgpt-annotator-popover-body">${escapeHtml(selectedAnnotation.note || "No note added yet.")}</div>`,
      '  </div>',
      '</div>',
      '<div class="cgpt-annotator-popover-actions">',
      `  <button class="cgpt-annotator-btn cgpt-annotator-delete" data-action="delete" data-id="${selectedAnnotation.id}">Delete</button>`,
      `  <button class="cgpt-annotator-btn cgpt-annotator-btn-secondary" data-action="export-single" data-id="${selectedAnnotation.id}">Export this</button>`,
      `  <button class="cgpt-annotator-btn cgpt-annotator-btn-primary" data-action="edit" data-id="${selectedAnnotation.id}">Edit</button>`,
      '</div>'
    ].join("");

    if (keepPosition) {
      popover.style.left = currentLeft;
      popover.style.top = currentTop;
      return;
    }

    const piece = anchorElement || getHighlightPieces(selectedAnnotation.id)[0];
    if (!piece) {
      popover.style.left = '12px';
      popover.style.top = '12px';
      return;
    }

    const width = Math.min(360, window.innerWidth - 24);
    const rect = piece.getBoundingClientRect();
    const preferLeft = rect.right + width + 20 > window.innerWidth;
    const left = preferLeft
      ? clamp(rect.left - width - 14, 12, window.innerWidth - width - 12)
      : clamp(rect.right + 14, 12, window.innerWidth - width - 12);
    const top = clamp(rect.top - 12, 12, window.innerHeight - 120);

    popover.style.width = `${width}px`;
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function hidePopover() {
    endSinglePanelDrag('popover', state.dom.popover);
    state.activeAnnotationId = null;
    state.popoverAnnotationIds = [];
    state.popoverSelectedId = null;
    syncActiveMarker();
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}.is-focused`).forEach((piece) => {
      piece.classList.remove("is-focused");
    });
    state.dom.popover.hidden = true;
    state.dom.popover.innerHTML = "";
  }

  function syncActiveMarker() {
    state.dom.rail.querySelectorAll(`.${MARKER_CLASS}`).forEach((marker) => {
      marker.classList.toggle("is-active", marker.dataset.id === state.activeAnnotationId);
    });
  }

  async function deleteAnnotation(annotationId) {
    removeHighlight(annotationId);
    state.annotations = state.annotations.filter((item) => item.id !== annotationId);
    await persistAnnotations();
    syncHighlightDecorations();
    renderMarkers();

    const remainingIds = normalizeAnnotationIds(state.popoverAnnotationIds.filter((item) => item !== annotationId));
    if (remainingIds.length) {
      const nextId = remainingIds.includes(state.popoverSelectedId) ? state.popoverSelectedId : getNewestAnnotationId(remainingIds);
      focusHighlightPieces(nextId, false);
      showPopover(remainingIds, nextId, null, true);
      return;
    }

    hidePopover();
  }

  function removeHighlight(annotationId) {
    getHighlightPieces(annotationId).forEach((piece) => {
      const parent = piece.parentNode;
      if (!parent) {
        return;
      }
      while (piece.firstChild) {
        parent.insertBefore(piece.firstChild, piece);
      }
      parent.removeChild(piece);
      parent.normalize();
    });
  }

  function getHighlightPieces(annotationId) {
    return Array.from(document.querySelectorAll(`.${HIGHLIGHT_CLASS}[data-annotation-id="${annotationId}"]`));
  }

  function collectAnnotationIdsAtTarget(target) {
    const ids = [];
    let current = target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
    while (current && current !== document.body) {
      if (current.classList && current.classList.contains(HIGHLIGHT_CLASS)) {
        ids.push(current.dataset.annotationId);
      }
      current = current.parentElement;
    }
    return normalizeAnnotationIds(ids);
  }

  function collectAnnotationIdsForPiece(piece, preferredId) {
    const ids = collectAnnotationIdsAtTarget(piece);
    piece.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((node) => {
      ids.push(node.dataset.annotationId);
    });
    if (preferredId) {
      ids.push(preferredId);
    }
    return normalizeAnnotationIds(ids, preferredId);
  }

  function normalizeAnnotationIds(ids, preferredId) {
    const seen = new Set();
    const ordered = [];
    ids.forEach((annotationId) => {
      if (!annotationId || seen.has(annotationId) || !getAnnotationById(annotationId)) {
        return;
      }
      seen.add(annotationId);
      ordered.push(annotationId);
    });

    ordered.sort((left, right) => {
      const leftAnnotation = getAnnotationById(left);
      const rightAnnotation = getAnnotationById(right);
      const leftTime = Date.parse(leftAnnotation?.createdAt || "") || 0;
      const rightTime = Date.parse(rightAnnotation?.createdAt || "") || 0;
      if (leftTime === rightTime) {
        return left.localeCompare(right);
      }
      return leftTime - rightTime;
    });

    if (preferredId && ordered.includes(preferredId)) {
      return ordered;
    }
    return ordered;
  }

  function getNewestAnnotationId(ids, fallbackId) {
    const normalized = normalizeAnnotationIds(ids, fallbackId);
    if (fallbackId && normalized.includes(fallbackId)) {
      return fallbackId;
    }
    return normalized[normalized.length - 1] || null;
  }

  async function reloadAnnotations() {
    clearAllHighlights();
    hideToolbar();
    hidePopover();

    const result = await chrome.storage.local.get([getStorageKey()]);
    state.annotations = Array.isArray(result[getStorageKey()]) ? result[getStorageKey()] : [];

    reapplyStoredAnnotations();
    renderMarkers();
  }

  function clearAllHighlights() {
    Array.from(document.querySelectorAll(`.${HIGHLIGHT_CLASS}`)).forEach((node) => {
      const parent = node.parentNode;
      if (!parent) {
        return;
      }
      while (node.firstChild) {
        parent.insertBefore(node.firstChild, node);
      }
      parent.removeChild(node);
      parent.normalize();
    });
  }

  function reapplyStoredAnnotations() {
    state.annotations.forEach((annotation) => {
      const range = resolveAnnotationRange(annotation);
      if (range) {
        applyAnnotation(annotation, range);
      }
    });
    syncHighlightDecorations();
    scheduleRailUpdate();
  }

  function resolveAnnotationRange(annotation) {
    const root = getConversationRoot();
    if (!root) {
      return null;
    }

    const rangeByQuote = findRangeByQuote(annotation);
    if (rangeByQuote) {
      return rangeByQuote;
    }

    if (!annotation.anchor) {
      return null;
    }

    const startNode = getNodeFromPath(root, annotation.anchor.startPath);
    const endNode = getNodeFromPath(root, annotation.anchor.endPath);
    if (!startNode || !endNode) {
      return null;
    }

    const range = document.createRange();
    try {
      range.setStart(startNode, clampOffset(startNode, annotation.anchor.startOffset));
      range.setEnd(endNode, clampOffset(endNode, annotation.anchor.endOffset));
      return range.toString() === annotation.quote ? range : null;
    } catch (error) {
      return null;
    }
  }

  function findRangeByQuote(annotation) {
    const root = getConversationRoot();
    if (!root || !annotation.quote) {
      return null;
    }

    const linear = collectLinearText(root);
    const matches = [];
    let searchStart = 0;
    while (searchStart <= linear.text.length) {
      const index = linear.text.indexOf(annotation.quote, searchStart);
      if (index === -1) {
        break;
      }
      matches.push(index);
      searchStart = index + 1;
    }

    if (!matches.length) {
      return null;
    }

    let chosenIndex = typeof annotation.occurrence === "number" && matches[annotation.occurrence] !== undefined
      ? matches[annotation.occurrence]
      : matches[0];

    const prefix = annotation.context && annotation.context.prefix ? annotation.context.prefix : "";
    const suffix = annotation.context && annotation.context.suffix ? annotation.context.suffix : "";

    for (const index of matches) {
      const prefixOk = !prefix || linear.text.slice(Math.max(0, index - prefix.length), index) === prefix;
      const suffixOk = !suffix || linear.text.slice(index + annotation.quote.length, index + annotation.quote.length + suffix.length) === suffix;
      if (prefixOk || suffixOk) {
        chosenIndex = index;
        break;
      }
    }

    const endIndex = chosenIndex + annotation.quote.length;
    const startEntry = linear.entries.find((item) => item.start <= chosenIndex && chosenIndex < item.end);
    const endEntry = linear.entries.find((item) => item.start < endIndex && endIndex <= item.end);
    if (!startEntry || !endEntry) {
      return null;
    }

    const range = document.createRange();
    try {
      range.setStart(startEntry.node, chosenIndex - startEntry.start);
      range.setEnd(endEntry.node, endIndex - endEntry.start);
      return range;
    } catch (error) {
      return null;
    }
  }

  function handleMutations(mutations) {
    const changedOutsideOverlay = mutations.some((mutation) => {
      const target = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
      return target && !target.closest(`#${ROOT_ID}`);
    });

    if (!changedOutsideOverlay) {
      return;
    }

    scheduleRailUpdate();
    window.clearTimeout(state.reloadTimer);
    state.reloadTimer = window.setTimeout(() => {
      const missingAny = state.annotations.some((annotation) => getHighlightPieces(annotation.id).length === 0);
      if (missingAny) {
        clearAllHighlights();
        reapplyStoredAnnotations();
        renderMarkers();
        return;
      }
      syncHighlightDecorations();
    }, 300);
  }

  function checkLocationChange() {
    if (location.href === state.href) {
      return;
    }

    state.href = location.href;
    state.contextRange = null;
    state.lastContextPoint = null;
    bootstrapWhenReady();
    if (getConversationRoot()) {
      reloadAnnotations();
    }
  }

  function exportSingleAnnotation(annotationId) {
    const annotation = state.annotations.find((item) => item.id === annotationId);
    if (!annotation) {
      return;
    }

    const chatSlug = location.pathname.split("/").filter(Boolean).pop() || "chatgpt";
    downloadMarkdown(`chatgpt-annotation-${chatSlug}-${annotation.id}.md`, buildMarkdownDocument([serializeAnnotation(annotation)]));
  }

  function getAnnotationsInPageOrder() {
    return state.annotations
      .map((annotation, index) => ({
        annotation,
        index,
        top: getAnnotationPageTop(annotation)
      }))
      .sort((left, right) => {
        if (left.top === right.top) {
          return left.index - right.index;
        }
        return left.top - right.top;
      })
      .map((item) => item.annotation);
  }

  function getAnnotationPageTop(annotation) {
    const piece = getHighlightPieces(annotation.id)[0];
    if (!piece) {
      return Number.POSITIVE_INFINITY;
    }
    return piece.getBoundingClientRect().top + window.scrollY;
  }

  function buildMarkdownDocument(annotations) {
    const title = normalizeWhitespace(document.title) || "ChatGPT Conversation";
    const lines = [
      `# ${title}`,
      "",
      `URL: ${location.origin}${location.pathname}`,
      `Exported: ${new Date().toISOString()}`,
      ""
    ];

    if (!annotations.length) {
      lines.push("No annotations found.");
      return lines.join("\n");
    }

    annotations.forEach((annotation, index) => {
      lines.push(`## Annotation ${index + 1}`);
      lines.push("");
      lines.push("### Title");
      lines.push("");
      lines.push(annotation.title || "");
      lines.push("");
      lines.push("### Highlight");
      lines.push("");
      lines.push(annotation.quote || "");
      lines.push("");
      lines.push("### Note");
      lines.push("");
      lines.push(annotation.note || "");
      lines.push("");
    });

    return lines.join("\n");
  }

  function serializeAnnotation(annotation) {
    return {
      id: annotation.id,
      title: annotation.title || "",
      quote: annotation.quote || "",
      note: annotation.note || "",
      createdAt: annotation.createdAt || null,
      updatedAt: annotation.updatedAt || null,
      occurrence: typeof annotation.occurrence === "number" ? annotation.occurrence : 0,
      textPosition: typeof annotation.textPosition === "number" ? annotation.textPosition : null
    };
  }

  function downloadMarkdown(filename, content) {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function persistAnnotations() {
    await chrome.storage.local.set({ [getStorageKey()]: state.annotations });
  }

  function getStorageKey() {
    return `${STORAGE_PREFIX}${location.origin}${location.pathname}`;
  }

  function getAnnotationById(annotationId) {
    return state.annotations.find((item) => item.id === annotationId) || null;
  }

  function getColorByName(name) {
    return COLOR_OPTIONS.find((item) => item.name === name) || COLOR_OPTIONS[0];
  }

  function getNodePath(root, node) {
    if (!root || !node) {
      return null;
    }

    const path = [];
    let current = node;
    while (current && current !== root) {
      const parent = current.parentNode;
      if (!parent) {
        return null;
      }
      path.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
      current = parent;
    }

    return current === root ? path : null;
  }

  function getNodeFromPath(root, path) {
    if (!root || !Array.isArray(path)) {
      return null;
    }

    let current = root;
    for (const index of path) {
      if (!current.childNodes || !current.childNodes[index]) {
        return null;
      }
      current = current.childNodes[index];
    }
    return current;
  }

  function clampOffset(node, offset) {
    if (node.nodeType === Node.TEXT_NODE) {
      return clamp(offset || 0, 0, node.textContent.length);
    }
    return clamp(offset || 0, 0, node.childNodes.length);
  }

  function normalizeWhitespace(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
