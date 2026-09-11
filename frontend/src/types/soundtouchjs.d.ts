declare module "soundtouchjs" {
  export class PitchShifter {
    constructor(context: AudioContext, buffer: AudioBuffer, bufferSize: number);
    tempo: number;
    pitchSemitones: number;
    sourcePosition: number;
    connect(destination: AudioNode): void;
    disconnect(): void;
  }
}
