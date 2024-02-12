class OpacityColorMapContainer {
    constructor(color, initialOpacity, finalOpacity, startFade, endFade) {
      this.color = wwtlib.Color.load(color);
      this.initialOpacity = initialOpacity;
      this.finalOpacity = finalOpacity;
      this.startFade = startFade;
      this.endFade = endFade;
  
      this.slope = (this.finalOpacity - this.initialOpacity) / (this.endFade - this.startFade);
      this.intercept = this.initialOpacity - this.slope * this.startFade;
    }
  
    findOpacity(phase) {
      if (phase < this.startFade) {
        return this.initialOpacity;
      } else if (phase > this.endFade) {
        return this.finalOpacity;
      } else {
        return this.slope * phase + this.intercept;
      }
    }
  
    findClosestColor(phase) {
      const opacity = this.findOpacity(phase);
      return wwtlib.Color.fromArgb(opacity, this.color.r, this.color.g, this.color.b);
    }
  }