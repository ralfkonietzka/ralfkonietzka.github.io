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
var factor, bestFit60Annotation, bestFit240Annotation;
var bestFitAnnotations = [];

var startTime = new Date("2023-10-18 11:55:55Z");
var endTime = new Date("2025-10-06 11:55:55Z");


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
  wwtlib.SpaceTimeController.set_syncToClock(false);
  wwtlib.SpaceTimeController.set_now(startTime);
  const ra = 22.36801497192689;
  const dec = 22.68;
  const zoom = 2189465275.4030666;
  wwt.gotoRADecZoom(ra, dec, zoom, true);
  const SECONDS_PER_DAY = 86400;
  const timeRate = 120 * SECONDS_PER_DAY;
  wwtlib.SpaceTimeController.set_timeRate(timeRate);

  // To stop for testing purposes
  // wwtlib.SpaceTimeController.set_now(new Date("2023-10-18 11:55:55Z"));
  // wwtlib.SpaceTimeController.set_syncToClock(false);

  settings.set_solarSystemStars(false);
  settings.set_actualPlanetScale(true);
  settings.set_showConstellationBoundries(false);  // The typo is intentional
  settings.set_showConstellationFigures(false);
  settings.set_showCrosshairs(false);
  // setupDustLayer();
  setupClusterLayer();
  setupSunLayer();
  setupBestFitLayer().then(() => {
    setupBestFitPhaseLayers().then(() => {
      window.requestAnimationFrame(onAnimationFrame);
      hideLoadingModal();
      let fadeInterval;
      setTimeout(() => {
        fadeInterval = setInterval(() => {
          const opacity = bestFit60Annotation.get_opacity();
          const newOpacity = Math.max(opacity - 0.1, 0);
          bestFit60Annotation.set_opacity(newOpacity);
          bestFit240Annotation.set_opacity(newOpacity);
        }, 100);
      }, 3000);
      setTimeout(() => {
        scriptInterface.removeAnnotation(bestFit60Annotation);
        scriptInterface.removeAnnotation(bestFit240Annotation);
        wwtlib.SpaceTimeController.set_syncToClock(true);
        clearInterval(fadeInterval);
      }, 4000);
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
    layer.set_decay(0.01);
  }
}

function setupDustLayer() {
  fetch("RW_dust_oscillation_phase_updated_radec.csv")
    .then(response => response.text())
    .then(text => text.replace(/\n/g, "\r\n"))
    .then(text => { 
      dustLayer = wwtlib.LayerManager.createSpreadsheetLayer("Sky", "Radcliffe Wave Dust", text);
      basicLayerSetup(dustLayer, true);
      dustLayer.set_scaleFactor(25);
    });
}

function setupClusterLayer() {
  fetch("RW_cluster_oscillation_phase_updated_radec_trimmed.csv")
    .then(response => response.text())
    .then(text => text.replace(/\n/g, "\r\n"))
    .then(text => { 
      clusterLayer = wwtlib.LayerManager.createSpreadsheetLayer("Sky", "Radcliffe Wave Cluster", text);
      basicLayerSetup(clusterLayer, true);
      clusterLayer.set_color(wwtlib.Color.load("#1f3cf1"));
      clusterLayer.set_scaleFactor(30);
    });
}

function setupSunLayer() {
  fetch("Sun_radec_C.csv")
    .then(response => response.text())
    .then(text => text.replace(/\n/g, "\r\n"))
    .then(text => { 
      sunLayer = wwtlib.LayerManager.createSpreadsheetLayer("Sky", "Radcliffe Wave Sun", text);
      basicLayerSetup(sunLayer, false);
      sunLayer.set_color(wwtlib.Color.load("#ffff0a"));
      sunLayer.set_scaleFactor(50);
    });
}

function setupBestFitLayer() {
  return fetch("RW_best_fit_oscillation_phase_radec_downsampled.csv")
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

function setupBestFitPhaseLayers() {
  const setup60 = fetch("RW_best_fit_60_radec.csv")
    .then(response => response.text())
    .then(text => text.replace(/\n/g, "\r\n"))
    .then(text => {
      bestFit60Layer = new wwtlib.SpreadSheetLayer();
      bestFit60Layer.loadFromString(text, false, false, false, true);
      basicLayerSetup(bestFit60Layer);
      bestFit60Layer.set_name("Radcliffe Wave Best Fit 60");
    })
    .then(() => {
      bestFit60Annotation = new wwtlib.PolyLine();
      bestFit60Annotation.set_lineColor("purple");
      addLayerPointsToAnnotation(bestFit60Layer, bestFit60Annotation, null);
      scriptInterface.addAnnotation(bestFit60Annotation);
    });

    const setup240 = fetch("RW_best_fit_240_radec.csv")
    .then(response => response.text())
    .then(text => text.replace(/\n/g, "\r\n"))
    .then(text => {
      bestFit240Layer = new wwtlib.SpreadSheetLayer();
      bestFit240Layer.loadFromString(text, false, false, false, true);
      basicLayerSetup(bestFit240Layer);
      bestFit240Layer.set_name("Radcliffe Wave Best Fit 240");
    })
    .then(() => {
      bestFit240Annotation = new wwtlib.PolyLine();
      bestFit240Annotation.set_lineColor("green");
      addLayerPointsToAnnotation(bestFit240Layer, bestFit240Annotation, null);
      scriptInterface.addAnnotation(bestFit240Annotation);
    });

    return Promise.all([setup60, setup240]);
}

function addLayerPointsToAnnotation(layer, annotation, rowFilter) {
  const lngCol = layer.get_lngColumn();
  const latCol = layer.get_latColumn();
  const dCol = layer.get_altColumn();
  const ecliptic = wwtlib.Coordinates.meanObliquityOfEcliptic(wwtlib.SpaceTimeController.get_jNow()) / 180 * Math.PI;

  for (const row of layer.get__table().rows) {
    if (rowFilter != null && !rowFilter(row)) {
      continue;
    }
    
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

function updateBestFitAnnotation(phase) {
  const phaseCol = 3;
  bestFitAnnotations.forEach(ann => scriptInterface.removeAnnotation(ann));
  bestFitAnnotations = [];
  for (let i = 0; i < 5; i++) {
    const annotation = new wwtlib.PolyLine();
    annotation.set_lineColor("#83befb");
    addLayerPointsToAnnotation(bestFitLayer, annotation, (row) => row[phaseCol] == phase);
    bestFitAnnotations.push(annotation);
    scriptInterface.addAnnotation(annotation);
  }
}

// WWT isn't actually using the phase -
// it's using the start/end times that I constructed from it.
// This means that to get the current phase, we need to extract it from the WWT clock.
function getCurrentPhaseInfo() {
  const start = startTime.getTime();
  const now = wwtlib.SpaceTimeController.get_now().getTime();
  const interval = 8.64e7;  // 1 day in ms
  let intervals = Math.floor((now - start) / interval);
  return [Math.floor(intervals / 360), intervals % 360];
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


const slope = -1 / 80;
const intercept = 1 - slope * 100;

function opacityForPhase(phase, period) {
  if (period === 0 && phase <= 100) return 1;
  else if (period === 1 && phase <= 260) return 0;
  if (period === 1) {
    phase = 460 - phase;
  }
  return Math.min(Math.max(slope * phase + intercept, 0), 1);
}


function onAnimationFrame(_timestamp) {
  if (wwtlib.SpaceTimeController.get_now() >= endTime) {
    wwtlib.SpaceTimeController.set_now(startTime);
  }
  const [_period, phase] = getCurrentPhaseInfo();
  updateBestFitAnnotation(phase);
  window.requestAnimationFrame(onAnimationFrame);
}

window.addEventListener("load", initWWT);
