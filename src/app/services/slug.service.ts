import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SlugService {

  constructor() { }

  getBookSlug(bookName: string | undefined | null): string {
    if (!bookName) return '';
    return bookName
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-') // Replace spaces with -
      .replace(/[^\w\u0621-\u064A\u0660-\u0669\u06F0-\u06F9\-]+/g, '') // Keep Arabic, numbers, and hyphen
      .replace(/\-\-+/g, '-'); // Replace multiple - with single -
  }
}
