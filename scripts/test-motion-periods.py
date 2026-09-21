import importlib.util
from pathlib import Path
import unittest
import numpy as np

spec=importlib.util.spec_from_file_location('motion',Path(__file__).with_name('export-motion-periods.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class PeriodTests(unittest.TestCase):
    def test_endpoints_and_unavailable_decade(self):
        times=np.array(['2016-08-01','2021-01-01','2024-12-29','2025-11-24','2025-12-30'],dtype='datetime64[ns]')
        self.assertEqual(m.period_indices(times,'month')[:2],(3,4))
        self.assertEqual(m.period_indices(times,'year')[:2],(2,4))
        self.assertEqual(m.period_indices(times,'five')[:2],(1,4))
        self.assertIsNone(m.period_indices(times,'ten'))
    def test_measured_difference_and_both_endpoint_quality(self):
        start=np.array([.01,.02,np.nan,.02,.02,.02]);end=np.array([.012,.03,.03,.03,.03,.03])
        result=m.difference(start,end,np.array([1,0,1,1,1,1]),np.array([1,1,1,0,1,1]),np.array([.8,.8,.8,.8,.4,.8]),np.array([.8,.8,.8,.8,.8,.4]))
        self.assertAlmostEqual(float(result[0]),2)
        self.assertTrue(np.isnan(result[1:]).all())

if __name__=='__main__': unittest.main()
