/*
  * In `onReady`, the `wwtlib.SpaceTimeController.set_timeRate` will control the speed of the movement
  * The colors and point sizes are set in the `setupDustLayer` and `setupClusterLayer` functions 
  * Just to allow using WWT's internal clock, I've set 1 degree of phase to correspond to a time of 1 day
  * 
  * For getting the current view parameters, run the following in the JavaScript console
  * RA: wwt.renderContext.viewCamera.get_RA()
  * Dec: wwt.renderContext.viewCamera.get_dec()
  * Zoom: wwt.renderContext.viewCamera.zoom
  * */

var scriptInterface, wwt;
var clusterLayer, dustLayer, sunLayer, bestFitLayer;
var factor;
let bestFitPhaseLayers = [];
let bestFitAnnotations = [];
let bestFitPhaseAnnotations = [];

let firstChanged = false;
let timeSlider;
let playSvg;
let pauseSvg;

const startDate = new Date("2023-10-18 11:55:55Z");
const endDate = new Date("2025-10-06 11:55:55Z");
const startTime = startDate.getTime();
const endTime = endDate.getTime();

const SECONDS_PER_DAY = 86400;
const timeRate = 120 * SECONDS_PER_DAY;

const bestFitOffsets = [-2, -1, 0, 1, 2];
const bestFitPhases = [58, 59, 60, 61, 62, 238, 239, 240, 241, 242];
const phaseRowCount = 300;

const initialRA = 271.87846654/15;
const initialDec = -48.42;
const initialZoom = 289555092.0 * 6;

var oniOS = (function () {
  var iosQuirkPresent = function () {
      var audio = new Audio();

      audio.volume = 0.5;
      return audio.volume === 1;   // volume cannot be changed from "1" on iOS 12 and below
  };

  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  var isAppleDevice = navigator.userAgent.includes('Macintosh');
  var isTouchScreen = navigator.maxTouchPoints >= 1;   // true for iOS 13 (and hopefully beyond)

  return isIOS || (isAppleDevice && (isTouchScreen || iosQuirkPresent()));
})();

function initWWT() {
  const builder = new wwtlib.WWTControlBuilder("wwtcanvas");
  builder.startRenderLoop(true);
  scriptInterface = builder.create();
  scriptInterface.add_ready(onReady); 
}

function onReady() {
  wwt = wwtlib.WWTControl.singleton;
  const settings = scriptInterface.settings;
  wwt.setBackgroundImageByName("Solar System");
  wwt.setForegroundImageByName("Solar System");
  wwtlib.SpaceTimeController.set_timeRate(timeRate);
  wwtlib.SpaceTimeController.set_syncToClock(false);
  wwtlib.SpaceTimeController.set_now(startDate);
  wwt.gotoRADecZoom(initialRA, initialDec, initialZoom, true);
  
  // To stop for testing purposes
  // wwtlib.SpaceTimeController.set_now(new Date("2023-10-18 11:55:55Z"));
  // wwtlib.SpaceTimeController.set_syncToClock(false);

  settings.set_solarSystemStars(false);
  settings.set_solarSystemCosmos(false);
  settings.set_actualPlanetScale(true);
  settings.set_showConstellationBoundries(false);  // The typo is intentional
  settings.set_showConstellationFigures(false);
  settings.set_showCrosshairs(false);
  const sunPromise = setupSunLayer();
  const clustersPromise = setupClusterLayers();
  const bestFitPromise = setupBestFitLayer();

  Promise.all([sunPromise, clustersPromise, bestFitPromise]).then(() => {
    setupBestFitPhaseAnnotations().then(() => {
      timeSlider = document.querySelector("#time-slider");
      playSvg = document.querySelector("#play");
      pauseSvg = document.querySelector("#pause");
      updateBestFitAnnotations(0);
      updateSlider(0);
      hideLoadingModal();
    });
  });
}

function hideLoadingModal() {
  const modal = document.querySelector("#modal-loading");
  modal.style.visibility = "hidden";
}

// All of our layers share a lot of basic setup
// so handle it all in one place
function basicLayerSetup(layer, timeSeries=false) {
  layer.set_lngColumn(0);
  layer.set_latColumn(1);
  layer.set_altColumn(2);
  layer.set_raUnits(wwtlib.RAUnits.degrees);
  layer.set_altUnit(wwtlib.AltUnits.parsecs);
  layer.set_altType(wwtlib.AltTypes.distance);
  layer.set_showFarSide(true);
  layer.set_markerScale(wwtlib.MarkerScales.screen);

  if (timeSeries) {
    layer.set_startDateColumn(4);
    layer.set_endDateColumn(5);
    layer.set_timeSeries(true);
    layer.set_decay(15);
  }
}

function setupDustLayer() {
  fetch("data/RW_dust_oscillation_phase_updated_radec.csv")
    .then(response => response.text())
    .then(text => text.replace(/\n/g, "\r\n"))
    .then(text => { 
      dustLayer = wwtlib.LayerManager.createSpreadsheetLayer("Sky", "Radcliffe Wave Dust", text);
      basicLayerSetup(dustLayer, true);
      dustLayer.set_scaleFactor(25);
    });
}

function setupClusterLayers() {
  const promises = [];
  for (let phase = -10; phase <= 270; phase++) {
    const p = fetch(`data/RW_cluster_oscillation_${phase}_updated_radec.csv`)
      .then(response => response.text())
      .then(text => text.replace(/\n/g, "\r\n"))
      .then(text => { 
        clusterLayer = wwtlib.LayerManager.createSpreadsheetLayer("Sky", `Radcliffe Wave Cluster Phase ${phase}`, text);
        basicLayerSetup(clusterLayer, true);
        clusterLayer.set_color(wwtlib.Color.load("#1f3cf1"));
        clusterLayer.set_opacity(opacityForPhase(phase));
        clusterLayer.set_scaleFactor(70);
      });
    promises.push(p);
  }
  return Promise.all(promises);
}

function setupSunLayer() {
  fetch("data/Sun_radec.csv")
    .then(response => response.text())
    .then(text => text.replace(/\n/g, "\r\n"))
    .then(text => { 
      sunLayer = wwtlib.LayerManager.createSpreadsheetLayer("Sky", "Radcliffe Wave Sun", text);
      basicLayerSetup(sunLayer, false);
      sunLayer.set_color(wwtlib.Color.load("#ffff0a"));
      sunLayer.set_scaleFactor(100);
    });
}

async function setupBestFitLayer() {
  return fetch("data/RW_best_fit_oscillation_phase_radec_downsampled.csv")
    .then(response => response.text())
    .then(text => text.replace(/\n/g, "\r\n"))
    .then(text => { 

      // We are deliberately not going to add this to the layer manager
      // We're just hijacking the table-parsing functionality for the line annotation
      bestFitLayer = new wwtlib.SpreadSheetLayer();
      bestFitLayer.loadFromString(text, false, false, false, true);
      basicLayerSetup(bestFitLayer, true);
      bestFitLayer.set_name("Radcliffe Wave Best Fit");
      bestFitLayer.set_color(wwtlib.Color.load("#83befb"));
    })
    .then(() => {
      factor = bestFitLayer.getScaleFactor(bestFitLayer.get_altUnit(), 1);
      factor = factor / (1000 * 149598000);
    })
}

function setupBestFitPhaseAnnotations() {
  const promises = bestFitPhases.map(phase => {
    return fetch(`data/RW_best_fit_${phase}_radec.csv`)
      .then(response => response.text())
      .then(text => text.replace(/\n/g, "\r\n"))
      .then(text => {
        const layer = new wwtlib.SpreadSheetLayer();
        layer.loadFromString(text, false, false, false, true);
        basicLayerSetup(layer);
        layer.set_name(`Radcliffe Wave Best Fit ${phase}`);
        bestFitPhaseLayers.push(layer);
        return layer;
      })
      .then(layer => {
        const annotation = new wwtlib.PolyLine();
        const color = phase < 200 ? "#ff45ff" : "#b0ff6d";
        annotation.set_lineColor(color);
        addPhasePointsToAnnotation(layer, annotation);
        scriptInterface.addAnnotation(annotation);
        bestFitPhaseAnnotations.push(annotation);
      });
  });
  return Promise.all(promises);
}

function addPhasePointsToAnnotation(layer, annotation, startIndex, endIndex) {
  const lngCol = layer.get_lngColumn();
  const latCol = layer.get_latColumn();
  const dCol = layer.get_altColumn();
  const ecliptic = wwtlib.Coordinates.meanObliquityOfEcliptic(wwtlib.SpaceTimeController.get_jNow()) / 180 * Math.PI;

  let rows = layer.get__table().rows;
  if (startIndex != null && endIndex != null) {
    rows = rows.slice(startIndex, endIndex);
  }

  for (const row of rows) {
    // The API for annotations seem to assume that we're in 2D sky mode - there's no option for distance
    // so we have to calculate our positions in 3D and just directly insert them into the array of points
    // These calculations are stolen from around here: https://github.com/Carifio24/wwt-webgl-engine/blob/master/engine/esm/layers/spreadsheet_layer.js#L706
    let alt = row[dCol];
    alt = (factor * alt);
    const pos = wwtlib.Coordinates.geoTo3dRad(row[latCol], row[lngCol], alt);
    pos.rotateX(ecliptic);
    annotation._points$1.push(pos);
  }
}

function updateBestFitAnnotations(phase) {
  bestFitAnnotations.forEach(ann => scriptInterface.removeAnnotation(ann));
  bestFitAnnotations = [];
  bestFitOffsets.forEach(offset => {
    const offsetPhase = ((phase + offset) % 360 + 360) % 360;
    const ann = new wwtlib.PolyLine();
    ann.set_lineColor("#C3ECFF");

    const startIndex = offsetPhase * phaseRowCount;
    const endIndex = (offsetPhase + 1) * phaseRowCount;
    addPhasePointsToAnnotation(bestFitLayer, ann, startIndex, endIndex);
    scriptInterface.addAnnotation(ann);
    bestFitAnnotations.push(ann);
  });
}

// WWT isn't actually using the phase -
// it's using the start/end times that I constructed from it.
// This means that to get the current phase, we need to extract it from the WWT clock.
function getCurrentPhaseInfo() {
  const start = startDate.getTime();
  const now = wwtlib.SpaceTimeController.get_now().getTime();
  const interval = 8.64e7;  // 1 day in ms
  let intervals = Math.floor((now - start) / interval);
  return [Math.floor(intervals / 360), intervals % 360];
}

function updateSlider(value) {
  timeSlider.value = String(value);
}

function onInputChange(value) {
  if (!isNaN(value)) {
    phase = Math.max(0, Math.min(value, 720));
    if (phase === 0) {
      resetInitialItems();
    } else {
      wwtlib.SpaceTimeController.set_syncToClock(false);
      updatePlayPauseIcon(false);
    }
    const time = startTime + (value / 720) * (endTime - startTime);
    updateBestFitAnnotations(phase);
    wwtlib.SpaceTimeController.set_now(new Date(time));
    if (!firstChanged) {
      onFirstChange();
    }
  }
}

function onFirstChange() {
  window.requestAnimationFrame(onAnimationFrame);
  bestFitPhaseAnnotations.forEach(ann => scriptInterface.removeAnnotation(ann));
  wwtlib.LayerManager.deleteLayerByID(sunLayer.id, true, true);
  firstChanged = true;
}

function resetInitialItems() {
  if (!firstChanged) {
    return;
  }
  updatePlayPauseIcon(false);
  wwtlib.SpaceTimeController.set_syncToClock(false);
  wwtlib.SpaceTimeController.set_now(startDate);
  bestFitPhaseAnnotations.forEach(ann => scriptInterface.addAnnotation(ann));
  wwtlib.LayerManager.addSpreadsheetLayer(sunLayer, "Sky");
  firstChanged = false;
}

function onPlayPauseClicked() {
  if (!firstChanged) {
    onFirstChange();
  }
  const play = !wwtlib.SpaceTimeController.get_syncToClock();
  wwtlib.SpaceTimeController.set_syncToClock(play);
  updatePlayPauseIcon(play);
}

function onResetClicked() {
  wwt.gotoRADecZoom(initialRA, initialDec, initialZoom, true);
  resetInitialItems();
}

function updatePlayPauseIcon(playing) {
  playSvg.style.display = playing ? "none" : "block";
  pauseSvg.style.display = playing ? "block" : "none";
}


var tourxml;
function getViewAsTour() {

  // Get current view as XML and save to the tourxml variable

  wwtlib.WWTControl.singleton.createTour()
  editor = wwtlib.WWTControl.singleton.tourEdit
  editor.addSlide()
  tour = editor.get_tour()
  blb = tour.saveToBlob()

  const reader = new FileReader();

  reader.addEventListener('loadend', (e) => {
  const text = e.srcElement.result;
    tourxml += text;
  });

  // Start reading the blob as text.
  reader.readAsText(blb);

}

const initialOpacity = 0.2;
const fadeStartPhase = 100;
const fadeEndPhase = 270;
const slope = -initialOpacity / (fadeEndPhase - fadeStartPhase);
const intercept = initialOpacity * fadeEndPhase / (fadeEndPhase - fadeStartPhase);

function opacityForPhase(phase) {
  return Math.min(Math.max(slope * phase + intercept, 0), initialOpacity);
}


function onAnimationFrame(_timestamp) {
  const [period, phase] = getCurrentPhaseInfo();
  updateBestFitAnnotations(phase);
  const totalPhase = period * 360 + phase;
  updateSlider(totalPhase);
  if (totalPhase === 720) {
    wwtlib.SpaceTimeController.set_syncToClock(false);
  }
  if (totalPhase >= 720 || (phase === 0 && !wwtlib.SpaceTimeController.get_syncToClock())) {
    resetInitialItems();
  }
  window.requestAnimationFrame(onAnimationFrame);
}

window.addEventListener("load", initWWT);
