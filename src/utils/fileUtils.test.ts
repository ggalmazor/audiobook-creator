import { assertEquals } from "jsr:@std/assert"
import { deduplicateFiles, type MP3File } from "./fileUtils.ts"

Deno.test("deduplicateFiles removes files with duplicate paths", () => {
  const existingFiles: MP3File[] = [
    { name: "song1.mp3", path: "/path/to/song1.mp3", size: 1000 },
    { name: "song2.mp3", path: "/path/to/song2.mp3", size: 2000 }
  ]

  const newFiles: MP3File[] = [
    { name: "song1.mp3", path: "/path/to/song1.mp3", size: 1000 }, // duplicate
    { name: "song3.mp3", path: "/path/to/song3.mp3", size: 3000 }  // new
  ]

  const result = deduplicateFiles(existingFiles, newFiles)
  
  assertEquals(result.length, 1)
  assertEquals(result[0].name, "song3.mp3")
})

Deno.test("deduplicateFiles returns all files when no duplicates", () => {
  const existingFiles: MP3File[] = [
    { name: "song1.mp3", path: "/path/to/song1.mp3", size: 1000 }
  ]

  const newFiles: MP3File[] = [
    { name: "song2.mp3", path: "/path/to/song2.mp3", size: 2000 },
    { name: "song3.mp3", path: "/path/to/song3.mp3", size: 3000 }
  ]

  const result = deduplicateFiles(existingFiles, newFiles)
  
  assertEquals(result.length, 2)
})

Deno.test("deduplicateFiles works with empty existing files", () => {
  const existingFiles: MP3File[] = []

  const newFiles: MP3File[] = [
    { name: "song1.mp3", path: "/path/to/song1.mp3", size: 1000 }
  ]

  const result = deduplicateFiles(existingFiles, newFiles)
  
  assertEquals(result.length, 1)
  assertEquals(result[0].name, "song1.mp3")
})