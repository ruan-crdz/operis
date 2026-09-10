'use client';
import { startTransition } from 'react';

/** Invoke a mutation in React's action context, preserving its typed result. */
export function invokeAction<T>(action: (form: FormData) => Promise<T>, form: FormData): Promise<T> {
  return new Promise((resolve, reject) => {
    startTransition(async () => {
      try {
        resolve(await action(form));
      } catch (error) {
        reject(error);
      }
    });
  });
}
