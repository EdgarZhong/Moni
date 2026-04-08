export class AsyncMutex {
  private mutex = Promise.resolve();

  lock(): Promise<() => void> {
    let unlock: () => void;
    // Create a promise that resolves when the lock is released
    const nextLock = new Promise<void>(resolve => {
      unlock = resolve;
    });

    // Capture the current state of the mutex
    const prevMutex = this.mutex;
    
    // Update the mutex to wait for the new lock to be released
    this.mutex = prevMutex.then(() => nextLock);

    // Return a promise that resolves (granting the lock) when the previous mutex resolves
    return prevMutex.then(() => unlock);
  }

  async dispatch<T>(fn: () => Promise<T>): Promise<T> {
    const unlock = await this.lock();
    try {
      return await fn();
    } finally {
      unlock();
    }
  }
}
