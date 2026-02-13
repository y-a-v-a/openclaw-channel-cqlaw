/**
 * In-memory contest dupe sheet keyed by callsign + band.
 */

export class ContestDupeSheet {
  private readonly worked = new Set<string>();

  isDupe(callsign: string, band: string): boolean {
    return this.worked.has(this.key(callsign, band));
  }

  markWorked(callsign: string, band: string): void {
    this.worked.add(this.key(callsign, band));
  }

  totalWorked(): number {
    return this.worked.size;
  }

  private key(callsign: string, band: string): string {
    return `${callsign.toUpperCase()}|${band.toLowerCase()}`;
  }
}
