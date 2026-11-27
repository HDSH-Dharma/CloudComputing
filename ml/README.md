# Print failure classifier

A small image classifier (`failure` / `normal`) that runs in the browser on every frame of the video demo
(`/monitoring/demo`). It does not decide on its own. When 3 frames in a row look like a failure (≥ 80 %), it asks
Gemini to check right away, so Gemini can run every 30 s instead of every 10 s. See `decide()` and `mlTrigger()` in
`supabase/functions/_shared/monitor/detect.ts`.

## Train

1. Open `ml/train.ipynb` in Google Colab (File > Open notebook > GitHub, paste the repo URL) and pick a T4 GPU.
2. Add a free Roboflow API key as the Colab secret `ROBOFLOW_API_KEY`.
3. Optional but recommended: upload one-class videos from your own printer to `own_videos/normal/` and
   `own_videos/failure/`.
4. Run all cells. The last one downloads `print-cls.onnx` (about 6 MB) and `print-cls.json`.
5. Copy both files to `apps/web/public/models/` and commit them, so everyone's demo uses the same model.

Without these files the demo still works with motion and Gemini only. It shows "Model ML: Belum ada".

## Data

| Dataset (Roboflow Universe) | Used as | Licence |
|---|---|---|
| [Spaghetti 3D](https://universe.roboflow.com/3d-printing-failure/spaghetti-3d) | failure | CC BY 4.0 |
| [3D printing defects (hnnm)](https://universe.roboflow.com/hnnm/3d-printing-defects-eavhn) | failure | CC BY 4.0 |
| [FDM Failures - Spaghetti](https://universe.roboflow.com/bu-engme500-vision-project/fdm-failures-spaghetti) | failure | CC BY 4.0 |
| [3d print detecting_V2](https://universe.roboflow.com/robot-project-nmclh/3d-print-detecting_v2-fxxli) | failure + normal | CC BY 4.0 |
| [3Dprinting](https://universe.roboflow.com/3d-printing-dataset/3dprinting-uo6du) (fork first, see notebook) | failure | Public domain |

All are real photos, not synthetic. Public sets have few `normal` images and none of "part detached from the bed"
from a front camera, which is why your own videos matter. Keep the three demo videos out of training: they are the
end-to-end test.

`prep.py` splits by original photo or source video, so augmented copies and neighbouring frames never sit in both
train and test. Self-check: `python ml/prep.py`.

The model is YOLO11n-cls from Ultralytics (AGPL-3.0), fine for a class project.
