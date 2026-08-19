(() => {
  const supportedExtensions = new Set(['txt', 'md', 'csv', 'tsv', 'json', 'html', 'htm', 'docx', 'pdf', 'xlsx', 'pptx']);

  function extensionOf(name = '') {
    return String(name).split('.').pop()?.toLowerCase() || '';
  }

  function isSupportedFile(file) {
    return supportedExtensions.has(extensionOf(file?.name));
  }

  function documentProgress(documentState) {
    const paragraphs = Array.isArray(documentState?.paragraphs) ? documentState.paragraphs : [];
    const total = paragraphs.length;
    const completed = paragraphs.filter((paragraph) => paragraph.translation && paragraph.status === 'done').length;
    return { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 };
  }

  function isDocumentComplete(documentState) {
    const progress = documentProgress(documentState);
    return progress.total > 0 && progress.completed === progress.total;
  }

  function fileBadgeText(name) {
    const extension = extensionOf(name);
    if (extension === 'pdf') return 'PDF';
    if (extension === 'xlsx') return 'XLS';
    if (extension === 'pptx') return 'PPT';
    return 'W';
  }

  async function collectDirectoryFiles(directoryHandle) {
    const collected = [];
    async function walk(handle, pathParts) {
      for await (const [name, entry] of handle.entries()) {
        if (entry.kind === 'directory') {
          await walk(entry, [...pathParts, name]);
          continue;
        }
        const file = await entry.getFile();
        if (!isSupportedFile(file)) continue;
        collected.push({ file, handle: entry, relativePath: [...pathParts, name].join('/') });
      }
    }
    await walk(directoryHandle, [directoryHandle.name]);
    return collected.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'zh-CN'));
  }

  function createFileIcon(documentState, complete = false) {
    const icon = document.createElement('span');
    icon.className = `batch-file-icon${complete ? ' is-complete' : ''}`;
    icon.textContent = fileBadgeText(documentState.name);
    return icon;
  }

  function renderDocumentList({ documents, activeId, runningId, onOpen }) {
    const list = document.getElementById('batchDocumentList');
    if (!list) return;
    list.replaceChildren();
    if (!documents.length) {
      const empty = document.createElement('div');
      empty.className = 'batch-queue-empty';
      empty.innerHTML = '<span class="batch-empty-mark">＋</span><strong>还没有文档</strong><span>点击“导入”，选择多个文件或扫描整个文件夹。</span>';
      list.appendChild(empty);
      return;
    }
    documents.forEach((documentState) => {
      const complete = isDocumentComplete(documentState);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `batch-document-row${String(documentState.id) === String(activeId) ? ' is-active' : ''}`;
      row.dataset.documentId = String(documentState.id);
      const icon = createFileIcon(documentState, complete);
      const copy = document.createElement('span');
      copy.className = 'batch-document-copy';
      const name = document.createElement('strong');
      name.className = 'batch-document-name';
      name.textContent = documentState.name;
      const meta = document.createElement('span');
      meta.className = 'batch-document-meta';
      const savedAt = documentState.savedAt || documentState.updatedAt || Date.now();
      meta.innerHTML = `<span>${new Date(savedAt).toLocaleDateString('zh-CN')}</span><span>${Number(documentState.size || 0).toLocaleString()} 字</span>`;
      copy.append(name, meta);
      const state = document.createElement('span');
      const running = String(documentState.id) === String(runningId);
      state.className = `batch-document-state${complete ? ' is-complete' : running ? ' is-active' : ''}`;
      state.textContent = complete ? '✓' : '';
      row.append(icon, copy, state);
      row.addEventListener('click', () => onOpen?.(documentState));
      list.appendChild(row);
    });
  }

  function renderQueue({ documents, runningId, errors = new Map() }) {
    const list = document.getElementById('batchQueueList');
    if (!list) return;
    const pending = documents.filter((documentState) => !isDocumentComplete(documentState));
    list.replaceChildren();
    if (!pending.length) {
      const empty = document.createElement('div');
      empty.className = 'batch-queue-empty';
      empty.innerHTML = documents.length
        ? '<span class="batch-empty-mark">✓</span><strong>全部翻译完成</strong><span>完成的文档已经从进度队列移出，仍保留在左侧文档列表。</span>'
        : '<span class="batch-empty-mark">＋</span><strong>等待导入文档</strong><span>导入后，尚未完成的文档会出现在这里。</span>';
      list.appendChild(empty);
      return;
    }
    pending.forEach((documentState) => {
      const progress = documentProgress(documentState);
      const row = document.createElement('div');
      row.className = 'batch-queue-row';
      row.dataset.documentId = String(documentState.id);
      const documentCopy = document.createElement('div');
      documentCopy.className = 'batch-queue-document';
      documentCopy.append(createFileIcon(documentState), Object.assign(document.createElement('strong'), { textContent: documentState.name }));
      const count = document.createElement('span');
      count.className = `batch-queue-count${errors.has(String(documentState.id)) ? ' is-error' : ''}`;
      count.textContent = errors.get(String(documentState.id)) || `${progress.completed}/${progress.total}`;
      const track = document.createElement('div');
      track.className = 'batch-progress-track';
      track.style.setProperty('--batch-progress', `${progress.percent}%`);
      track.setAttribute('role', 'progressbar');
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', '100');
      track.setAttribute('aria-valuenow', String(progress.percent));
      track.setAttribute('aria-label', `${documentState.name} 翻译进度`);
      track.appendChild(document.createElement('span'));
      if (String(documentState.id) === String(runningId)) row.classList.add('is-running');
      row.append(documentCopy, count, track);
      list.appendChild(row);
    });
  }

  function animateCompleted(documentId, onComplete) {
    const row = document.querySelector(`#batchQueueList .batch-queue-row[data-document-id="${CSS.escape(String(documentId))}"]`);
    if (!row || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onComplete?.();
      return;
    }
    row.classList.add('is-leaving');
    window.setTimeout(() => onComplete?.(), 240);
  }

  window.EchoLangBatchUI = Object.freeze({
    collectDirectoryFiles,
    documentProgress,
    isDocumentComplete,
    isSupportedFile,
    renderDocumentList,
    renderQueue,
    animateCompleted,
    supportedExtensions,
  });
})();
