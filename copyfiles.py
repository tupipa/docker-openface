#!/usr/bin/python

import os
import subprocess as sp

targetRootDir = "."
srcRootDir = os.path.join(targetRootDir, '..' , 'openface')

filelist =  ["demos/web/index.html", "demos/web/js/openface-demo.js", 
		"demos/web/websocket-server.py"]
for file_ in filelist:
	copy_from = os.path.join(srcRootDir, file_)
	copy_to = targetRootDir

	cmd = ["cp", copy_from, copy_to]
	print cmd
	ret = sp.call(cmd)
	if ret != 0:
		print "ERROR in copying file from ", copy_from, " to ", copy_to
		exit(1)
	else:
		print "Done copying file ", copy_from , " to ", copy_to

