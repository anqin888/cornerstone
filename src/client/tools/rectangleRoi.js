var cornerstoneTools = (function ($, cornerstone, csc, cornerstoneTools) {

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }


    var toolType = 'rectangleRoi';

    function calculateMeanStdDev(sp)
    {
        // TODO: Get a real statistics library here that supports large counts
        if(sp.length == 0) {
            return {
                count: 0,
                mean: 0.0,
                variance: 0.0,
                stdDev: 0.0
            };
        }

        var sum = 0;
        var sumSquared =0;

        for(var i=0; i < sp.length; i++) {
            sum += sp[i];
            sumSquared += sp[i] * sp[i];
        }

        var mean = sum / sp.length;
        var variance = sumSquared / sp.length - mean * mean;

        return {
            count: sp.length,
            mean: mean,
            variance: variance,
            stdDev: Math.sqrt(variance)
        };
    }

    function drawNewMeasurement(e, coords, scale)
    {
        // create the tool state data for this tool with the end handle activated
        var data = {
            visible : true,
            handles : {
                start : {
                    x : coords.x,
                    y : coords.y,
                    highlight: true,
                    active: false
                },
                end: {
                    x : coords.x,
                    y : coords.y,
                    highlight: true,
                    active: true
                }
            }
        };

        // associate this data with this imageId so we can render it and manipulate it
        cornerstoneTools.addToolState(e.currentTarget, toolType, data);

        // since we are dragging to another place to drop the end point, we can just activate
        // the end point and let the handleHelper move it for us.
        cornerstoneTools.handleHandle(e, data.handles.end);
    }

    function pointNearTool(data, coords)
    {
        var rect = {
            left : Math.min(data.handles.start.x, data.handles.end.x),
            top : Math.min(data.handles.start.y, data.handles.end.y),
            width : Math.abs(data.handles.start.x - data.handles.end.x),
            height : Math.abs(data.handles.start.y - data.handles.end.y)
        };

        return cornerstoneTools.lineHelper.pointNearRect(coords, rect);
    }

    function onMouseDown(e) {
        var eventData = e.data;
        if(e.which == eventData.whichMouseButton) {
            var element = e.currentTarget;
            var viewport = cornerstone.getViewport(element);
            var coords = cornerstone.pageToImage(element, e.pageX, e.pageY);
            var toolData = cornerstoneTools.getToolState(e.currentTarget, toolType);

            // first check to see if we have an existing length measurement that has a handle that we can move
            if(toolData !== undefined) {
                for(var i=0; i < toolData.data.length; i++) {
                    var data = toolData.data[i];
                    if(cornerstoneTools.handleCursorNearHandle(e, data, coords, viewport.scale) == true) {
                        e.stopImmediatePropagation();
                        return;
                    }
                }
            }

            // now check to see if we have a tool that we can move
            if(toolData !== undefined) {
                for(var i=0; i < toolData.data.length; i++) {
                    var data = toolData.data[i];
                    if(pointNearTool(data, coords)) {
                        cornerstoneTools.moveAllHandles(e, data, toolData, true);
                        e.stopImmediatePropagation();
                        return;
                    }
                }
            }

            // If we are "active" start drawing a new measurement
            if(eventData.active === true) {
                // no existing measurements care about this, draw a new measurement
                drawNewMeasurement(e, coords, viewport.scale);
                e.stopImmediatePropagation();
                return;
            }
        }
    }

    function onMouseMove(e)
    {
        // if a mouse button is down, do nothing
        if(e.which != 0) {
            return;
        }

        // if we have no tool data for this element, do nothing
        var toolData = cornerstoneTools.getToolState(e.currentTarget, toolType);
        if(toolData === undefined) {
            return;
        }

        // We have tool data, search through all data
        // and see if the mouse cursor is close enough
        // to the tool to make it interactive (by highlighting
        // all handles) and close enough to make a handle draggable

        var imageNeedsUpdate = false;
        for(var i=0; i < toolData.data.length; i++) {
            // get the cursor position in image coordinates
            var element = e.currentTarget;
            var coords = cornerstone.pageToImage(element, e.pageX, e.pageY);
            var viewport = cornerstone.getViewport(element);
            var data = toolData.data[i];

            if(pointNearTool(data, coords) === true)
            {
                if(cornerstoneTools.setHighlightForAllHandles(data, true))
                {
                    imageNeedsUpdate = true;
                }
                if(cornerstoneTools.activateNearbyHandle(data.handles, coords, viewport.scale))
                {
                    imageNeedsUpdate = true;
                }
            }
            else
            {
                if(cornerstoneTools.deactivateAndUnhighlightAllHandles(data))
                {
                    imageNeedsUpdate = true;
                }
            }
        }

        // Handle activation status changed, redraw the image
        if(imageNeedsUpdate === true) {
            cornerstone.updateImage(element);
        }
    }



    function onImageRendered(e)
    {
        // if we have no toolData for this element, return immediately as there is nothing to do
        var toolData = cornerstoneTools.getToolState(e.currentTarget, toolType);
        if(toolData === undefined) {
            return;
        }

        // we have tool data for this element - iterate over each one and draw it
        var context = e.detail.canvasContext.canvas.getContext("2d");
        csc.setToPixelCoordinateSystem(e.detail.enabledElement, context);

        for(var i=0; i < toolData.data.length; i++) {
            context.save();
            var data = toolData.data[i];

            // draw the rectangle
            var width = Math.abs(data.handles.start.x - data.handles.end.x);
            var height = Math.abs(data.handles.start.y - data.handles.end.y);
            var left = Math.min(data.handles.start.x, data.handles.end.x);
            var top = Math.min(data.handles.start.y, data.handles.end.y);
            var centerX = (data.handles.start.x + data.handles.end.x) / 2;
            var centerY = (data.handles.start.y + data.handles.end.y) / 2;

            var context = e.detail.canvasContext;
            context.beginPath();
            context.strokeStyle = 'white';
            context.lineWidth = 1 / e.detail.viewport.scale;
            context.rect(left, top, width, height);
            context.stroke();


            // draw the handles
            context.beginPath();
            cornerstoneTools.drawHandles(context, e.detail.viewport, data.handles, e.detail.viewport.scale);
            context.stroke();

            // Calculate the mean, stddev, and area
            // TODO: calculate this in web worker for large pixel counts...
            var storedPixels = cornerstone.getStoredPixels(e.detail.element, left, top, width, height);
            var meanStdDev = calculateMeanStdDev(storedPixels);
            var area = Math.PI * (width * e.detail.image.columnPixelSpacing / 2) * (height * e.detail.image.rowPixelSpacing / 2);
            var areaText = "Area: " + area.toFixed(2) + " mm^2";

            // Draw text
            var fontParameters = csc.setToFontCoordinateSystem(e.detail.enabledElement, e.detail.canvasContext, 15);
            context.font = "" + fontParameters.fontSize + "px Arial";

            var textSize = context.measureText(area);

            var offset = fontParameters.lineHeight;
            var textX  = centerX < (e.detail.image.columns / 2) ? centerX + (width /2): centerX - (width/2) - textSize.width * fontParameters.fontScale;
            var textY  = centerY < (e.detail.image.rows / 2) ? centerY + (height /2): centerY - (height/2);

            var textX = textX / fontParameters.fontScale;
            var textY = textY / fontParameters.fontScale;

            context.fillStyle = "white";
            context.fillText("Mean: " + meanStdDev.mean.toFixed(2), textX, textY - offset);
            context.fillText("StdDev: " + meanStdDev.stdDev.toFixed(2), textX, textY);
            context.fillText(areaText, textX, textY + offset);
            context.restore();
        }
    }

    // enables the tool on the specified element.  The tool must first
    // be enabled before it can be activated.  Enabling it will allow it to display
    // any measurements that already exist
    // NOTE: if we want to make this tool at all configurable, we can pass in an options object here
    function enable(element)
    {
        element.addEventListener("CornerstoneImageRendered", onImageRendered, false);
        $(element).unbind('mousedown', onMouseDown);
        $(element).unbind('mousemove', onMouseMove);
        cornerstone.updateImage(element);
    }

    // disables the tool on the specified element.  This will cause existing
    // measurements to no longer be displayed.  You must re-enable the tool on an element
    // before you can activate it again.
    function disable(element)
    {
        element.removeEventListener("CornerstoneImageRendered", onImageRendered);
        $(element).unbind('mousedown', onMouseDown);
        $(element).unbind('mousemove', onMouseMove);
        cornerstone.updateImage(element);
    }

    // hook the mousedown event so we can create a new measurement
    function activate(element, whichMouseButton)
    {
        element.addEventListener("CornerstoneImageRendered", onImageRendered, false);
        $(element).unbind('mousedown', onMouseDown);
        $(element).unbind('mousemove', onMouseMove);
        var eventData = {
            whichMouseButton: whichMouseButton,
            active: true
        };
        $(element).mousedown(eventData, onMouseDown);
        $(element).mousemove(onMouseMove);
        cornerstone.updateImage(element);
    }

    // rehook mousedown with a new eventData that says we are not active
    function deactivate(element)
    {
        element.addEventListener("CornerstoneImageRendered", onImageRendered, false);
        $(element).unbind('mousedown', onMouseDown);
        $(element).unbind('mousemove', onMouseMove);
        // TODO: we currently assume that left mouse button is used to move measurements, this should
        // probably be configurable
        var eventData = {
            whichMouseButton: 1,
            active: false
        };
        $(element).mousedown(eventData, onMouseDown);
        $(element).mousemove(onMouseMove);
        cornerstone.updateImage(element);
    }

    // module/private exports
    //cornerstoneTools.enableEllipticalRoi = enableEllipticalRoi;
    //cornerstoneTools.disableEllipticalRoi = disableEllipticalRoi;

    cornerstoneTools.rectangleRoi = {
        enable: enable,
        disable : disable,
        activate: activate,
        deactivate: deactivate
    }

    return cornerstoneTools;
}($, cornerstone, cornerstoneCore, cornerstoneTools));