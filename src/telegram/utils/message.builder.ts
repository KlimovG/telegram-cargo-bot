export class MessageBuilder {
  private parts: string[] = [];

  addLine(line: string) {
    this.parts.push(line);
    return this;
  }

  addField(label: string, value: any, suffix = '') {
    if (value !== undefined && value !== null && value !== '') {
      this.parts.push(`${label}: ${value}${suffix}`);
    }
    return this;
  }

  build() {
    return this.parts.join('\n');
  }
} 