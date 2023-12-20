from matplotlib.colors import to_rgb


def wwt_rgbas_for_phases(phases, color, initial_opacity, final_opacity, start_fade=None, end_fade=None):

    rgb = [round(255 * c) for c in to_rgb(color)]
    rgb_str = ":".join(str(c) for c in rgb)

    if start_fade is None:
        start_fade = phases[0]

    if end_fade is None:
        end_fade = phases[-1]

    # Slope/intercept for linear interpolation
    m = (final_opacity - initial_opacity) / (end_fade - start_fade)
    b = initial_opacity - m * start_fade

    rgbas = []
    for phase in phases:
        phase = 180 - abs(180 - phase)
        if phase < start_fade:
            opacity = initial_opacity
        elif phase > end_fade:
            opacity = final_opacity
        else:
            opacity = m * phase + b

        opacity = round(opacity)
        
        rgba = f":{opacity}:{rgb_str}"
        rgbas.append(rgba)

    return rgbas

