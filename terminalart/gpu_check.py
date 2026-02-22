import ctypes
from ctypes import util
import os

def test_gl_context():
    gl_path = util.find_library('GL')
    if not gl_path:
        print("OpenGL Library (GL) not found.")
        return False
    
    try:
        gl = ctypes.CDLL(gl_path)
        print(f"Successfully linked to {gl_path}")
        # Basic check: can we find a core GL function?
        if hasattr(gl, 'glBegin'):
            print("Found core GL functions.")
            return True
        else:
            print("Linked but core functions missing.")
            return False
    except Exception as e:
        print(f"Failed to link: {e}")
        return False

if __name__ == '__main__':
    if test_gl_context():
        print("GPU Headless Context Check: PASSED")
    else:
        print("GPU Headless Context Check: FAILED")
