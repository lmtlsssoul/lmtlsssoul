import os
import sys
import subprocess
from ctypes import util

def check_nvidia():
    try:
        # Check if nvidia-smi works (NVIDIA drivers installed)
        res = subprocess.run(["nvidia-smi"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if res.returncode == 0:
            # Check for GL library
            if util.find_library("GL"):
                return True
        return False
    except:
        return False

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    gpu_script = os.path.join(base_dir, "art_scryer.py")
    cpu_script = os.path.join(base_dir, "art.9.py")
    
    # Priority: GPU version if hardware is detected
    if check_nvidia() and os.path.exists(gpu_script):
        try:
            # Try to run GPU version. Exit code 0 means user quit normally.
            # If it crashes (non-zero), we might want to fallback, but only if it failed early.
            # For now, we trust the GPU check.
            res = subprocess.call([sys.executable, gpu_script])
            if res != 0:
                 # If it failed (crashed), fallback to stable CPU version
                 subprocess.call([sys.executable, cpu_script])
        except Exception:
            subprocess.call([sys.executable, cpu_script])
    else:
        # No GPU detected or script missing, run CPU version
        if os.path.exists(cpu_script):
            subprocess.call([sys.executable, cpu_script])
        else:
            print("Error: Scryer scripts not found in ~/art/")

if __name__ == "__main__":
    main()
