const DB_NAME = 'career-wealth-delta-simulator'
const STORE_NAME = 'scenarios'
const DB_VERSION = 1

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'))
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

async function withStore(mode, work) {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const store = transaction.objectStore(STORE_NAME)

    let settled = false
    const finish = (resolver) => (value) => {
      if (!settled) {
        settled = true
        resolver(value)
      }
    }

    transaction.onerror = () => finish(reject)(transaction.error ?? new Error('IndexedDB transaction failed.'))
    transaction.onabort = () => finish(reject)(transaction.error ?? new Error('IndexedDB transaction aborted.'))

    work(store, finish(resolve), finish(reject))
  }).finally(() => {
    database.close()
  })
}

export async function listScenarioRecords() {
  return withStore('readonly', (store, resolve, reject) => {
    const request = store.getAll()
    request.onerror = () => reject(request.error ?? new Error('Failed to load saved scenarios.'))
    request.onsuccess = () => {
      const records = Array.isArray(request.result) ? request.result : []
      resolve(records.sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '')))
    }
  })
}

export async function saveScenarioRecord(record) {
  return withStore('readwrite', (store, resolve, reject) => {
    const request = store.put(record)
    request.onerror = () => reject(request.error ?? new Error('Failed to save scenario settings.'))
    request.onsuccess = () => resolve(record)
  })
}

export async function deleteScenarioRecord(id) {
  return withStore('readwrite', (store, resolve, reject) => {
    const request = store.delete(id)
    request.onerror = () => reject(request.error ?? new Error('Failed to delete saved scenario.'))
    request.onsuccess = () => resolve(undefined)
  })
}
