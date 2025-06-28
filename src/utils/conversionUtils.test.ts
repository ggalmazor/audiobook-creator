import { assertEquals } from "jsr:@std/assert"
import { validateConversionInputs, generateFFmpegArgs } from "./conversionUtils.ts"

Deno.test("validateConversionInputs rejects empty file list", () => {
  const result = validateConversionInputs([], "/output/path")
  assertEquals(result, "No MP3 files provided")
})

Deno.test("validateConversionInputs rejects empty output path", () => {
  const result = validateConversionInputs(["/path/file.mp3"], "")
  assertEquals(result, "Output path is required")
})

Deno.test("validateConversionInputs rejects non-MP3 files", () => {
  const result = validateConversionInputs(["/path/file.wav", "/path/file.mp3"], "/output/path")
  assertEquals(result, "Invalid files detected: /path/file.wav")
})

Deno.test("validateConversionInputs accepts valid inputs", () => {
  const result = validateConversionInputs(["/path/file1.mp3", "/path/file2.MP3"], "/output/path")
  assertEquals(result, null)
})

Deno.test("generateFFmpegArgs creates correct command for single file", () => {
  const args = generateFFmpegArgs(["/input/file1.mp3"], "/output/audiobook")
  const expected = [
    "-y",
    "-i", "/input/file1.mp3",
    "-filter_complex", "concat=n=1:v=0:a=1",
    "-vn", "-c:a", "aac", "-b:a", "64k",
    "-metadata", "genre=Audiobook",
    "/output/audiobook.m4b"
  ]
  assertEquals(args, expected)
})

Deno.test("generateFFmpegArgs creates correct command for multiple files with metadata", () => {
  const args = generateFFmpegArgs(
    ["/input/file1.mp3", "/input/file2.mp3"],
    "/output/audiobook.m4b",
    "My Book",
    "Author Name"
  )
  const expected = [
    "-y",
    "-i", "/input/file1.mp3",
    "-i", "/input/file2.mp3",
    "-filter_complex", "concat=n=2:v=0:a=1",
    "-vn", "-c:a", "aac", "-b:a", "64k",
    "-metadata", "title=My Book",
    "-metadata", "artist=Author Name",
    "-metadata", "genre=Audiobook",
    "/output/audiobook.m4b"
  ]
  assertEquals(args, expected)
})