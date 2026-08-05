(function () {
  const databaseName = 'zi-translation-desk';
  const version = 1;
  const documentStoreName = 'documents';
  const metaStoreName = 'meta';

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB 请求失败'));
    });
  }

  function transactionToPromise(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB 事务失败'));
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB 事务已中止'));
    });
  }

  function openDatabase() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open(databaseName, version);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(documentStoreName)) database.createObjectStore(documentStoreName, { keyPath: 'id' });
        if (!database.objectStoreNames.contains(metaStoreName)) database.createObjectStore(metaStoreName, { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('无法打开本地文档数据库'));
    });
  }

  const databasePromise = openDatabase().catch(() => null);

  async function listDocuments() {
    const database = await databasePromise;
    if (!database) return [];
    const transaction = database.transaction(documentStoreName, 'readonly');
    const values = await requestToPromise(transaction.objectStore(documentStoreName).getAll());
    await transactionToPromise(transaction);
    return Array.isArray(values) ? values : [];
  }

  async function getDocument(id) {
    const database = await databasePromise;
    if (!database) return null;
    const transaction = database.transaction(documentStoreName, 'readonly');
    const value = await requestToPromise(transaction.objectStore(documentStoreName).get(String(id)));
    await transactionToPromise(transaction);
    return value || null;
  }

  async function putDocument(document) {
    const database = await databasePromise;
    if (!database) return false;
    const transaction = database.transaction(documentStoreName, 'readwrite');
    transaction.objectStore(documentStoreName).put(document);
    await transactionToPromise(transaction);
    return true;
  }

  async function deleteDocument(id) {
    const database = await databasePromise;
    if (!database) return false;
    const transaction = database.transaction(documentStoreName, 'readwrite');
    transaction.objectStore(documentStoreName).delete(String(id));
    await transactionToPromise(transaction);
    return true;
  }

  async function getMeta(key) {
    const database = await databasePromise;
    if (!database) return null;
    const transaction = database.transaction(metaStoreName, 'readonly');
    const value = await requestToPromise(transaction.objectStore(metaStoreName).get(String(key)));
    await transactionToPromise(transaction);
    return value?.value ?? null;
  }

  async function setMeta(key, value) {
    const database = await databasePromise;
    if (!database) return false;
    const transaction = database.transaction(metaStoreName, 'readwrite');
    transaction.objectStore(metaStoreName).put({ key: String(key), value });
    await transactionToPromise(transaction);
    return true;
  }

  const documentStore = {
    ready: databasePromise,
    listDocuments,
    getDocument,
    putDocument,
    deleteDocument,
    getMeta,
    setMeta,
  };
  window.EchoLangDocumentStore = documentStore;
  window.ZiDocumentStore = documentStore;
})();
