
Kellerfeuchtigkeit

Batteriezustand erweitern

Datenpunkt-widget

Wetterwidget erweitern


rework the sunlight floorplan editor. The floorplan itself can be drawn with the editor as well. Migrate the existing eg, og, dg, basement svgs to the new floorplan editor format so we keep compatibility. For the floorplan outer walls and inner walls can be drawn.


add an optional 3d effect to the sunlightfloorplan. if activated it shows the floorplan walls and windows and blind status with a minimalistic 3d effect while keeping the birdview perspective. Keep the overall design style, do not add furnitures. This must not be available for legacy svg-floorplans. see mock image ![alt text](3dfloorplanimage.png)

Create a widget, matching the overall design patterns of my app to controll a dehumidifer system. It is controlled by two variables:
0_userdata.0.Feuchtigkeit.Power_Mode (bool) for on and off
0_userdata.0.Feuchtigkeit.Power_Mode_Level (int) 1=low, 2=medium, 3=high
The interface should allow to set a level, which always should set the bool to true than as well. There is also an option to set the bool to off. it is visible weather the system is running or not and on which level. The information can be displayed purely graphically