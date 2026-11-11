import datetime
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import snmp_panel

class PanelDataTest(unittest.TestCase):
    def result(self,time,uptime=100000):
        return {'timestamp':time.isoformat(),'source':'TI 10.10.0.52','targets':{target:{'address':'127.0.0.1','ok':True,'values':{'memory_total_kb':'INTEGER: 1000','memory_available_kb':'INTEGER: 200','memory_buffers_kb':'INTEGER: 100','memory_cached_kb':'INTEGER: 400','uptime':f'Timeticks: ({uptime})','load_1min':'STRING: "0.25"','interfaces':'INTEGER: 1'}} for target in ['edge','core']}}

    def test_numeric_values_do_not_turn_errors_into_zero(self):
        self.assertEqual(snmp_panel.number('Timeticks: (1234) 0:00:12.34'),1234)
        self.assertEqual(snmp_panel.number('STRING: "0.42"'),0.42)
        self.assertIsNone(snmp_panel.number('No Such Instance currently exists'))
        self.assertIsNone(snmp_panel.number(None))

    def test_history_rates_reset_and_retention(self):
        now=datetime.datetime.now(datetime.timezone.utc)
        current={'rx':1000,'tx':2000}
        def table(pid,target,address,oid):
            name=next(key for key,value in snmp_panel.ROOTS.items() if value==oid)
            return {'1': 'eth0' if target=='edge' else 'enp7s0'} if name=='name' else {'1':1 if name=='status' else current[name]}
        with tempfile.TemporaryDirectory() as temporary, patch.object(snmp_panel,'PANEL',Path(temporary)), patch.object(snmp_panel,'table',side_effect=table):
            snmp_panel.publish(self.result(now),'1')
            first=json.loads((Path(temporary)/'metrics.json').read_text())
            self.assertEqual(first['targets']['edge']['memory_used_percent'],30)
            self.assertIsNone(first['targets']['edge']['rx_mbps'])
            current['rx']+=7500000
            current['tx']+=15000000
            snmp_panel.publish(self.result(now+datetime.timedelta(seconds=60),106000),'1')
            next_sample=json.loads((Path(temporary)/'metrics.json').read_text())
            self.assertEqual(next_sample['targets']['edge']['rx_mbps'],1)
            self.assertEqual(next_sample['targets']['edge']['tx_mbps'],2)
            snmp_panel.publish(self.result(now+datetime.timedelta(seconds=120),100),'1')
            after_reboot=json.loads((Path(temporary)/'metrics.json').read_text())
            self.assertIsNone(after_reboot['targets']['edge']['rx_mbps'])
            history=json.loads((Path(temporary)/'history.json').read_text())
            self.assertEqual(len(history),3)
            snmp_panel.publish(self.result(now+datetime.timedelta(days=3),200),'1')
            self.assertEqual(len(json.loads((Path(temporary)/'history.json').read_text())),1)

if __name__=='__main__':unittest.main()
