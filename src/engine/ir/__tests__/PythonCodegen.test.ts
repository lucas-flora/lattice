import { describe, it, expect } from 'vitest';
import { generatePython } from '../PythonCodegen';
import { IR } from '../IRBuilder';
import { CONWAY_GOL_IR, AGE_FADE_IR } from './referencePrograms';

describe('PythonCodegen', () => {
  it('TestPython_ConwayGOL_ProducesReadableOutput', () => {
    const py = generatePython(CONWAY_GOL_IR);
    expect(py).toContain('neighbor_sum_alive');
    expect(py).toContain('self.alive');
  });

  it('TestPython_AgeFade_ProducesExpression', () => {
    const py = generatePython(AGE_FADE_IR);
    expect(py).toContain('self.alpha');
    expect(py).toContain('self.age');
  });

  it('TestPython_ReadProperty_CorrectScope', () => {
    const prog = IR.program([
      IR.declareVar('a', 'f32', IR.readCell('alive')),
      IR.declareVar('b', 'f32', IR.readEnv('feedRate')),
      IR.declareVar('c', 'f32', IR.readGlobal('myVar')),
    ], { inputs: [
      { property: 'alive', scope: 'cell', type: 'f32' },
      { property: 'feedRate', scope: 'env', type: 'f32' },
      { property: 'myVar', scope: 'global', type: 'f32' },
    ], outputs: [] });
    const py = generatePython(prog);
    expect(py).toContain('self.alive');
    expect(py).toContain('env_feedRate');
    expect(py).toContain('global_myVar');
  });

  it('TestPython_Select_EmitsTernary', () => {
    const prog = IR.program([
      IR.declareVar('x', 'f32', IR.select(IR.bool(true), IR.f32(1), IR.f32(0))),
    ], { inputs: [], outputs: [] });
    const py = generatePython(prog);
    expect(py).toContain('if');
    expect(py).toContain('else');
  });

  it('TestPython_NumPyFunctions_CorrectNames', () => {
    const prog = IR.program([
      IR.declareVar('a', 'f32', IR.sqrt(IR.f32(4))),
      IR.declareVar('b', 'f32', IR.clamp(IR.f32(1), IR.f32(0), IR.f32(2))),
      IR.declareVar('c', 'f32', IR.abs(IR.f32(-1))),
    ], { inputs: [], outputs: [] });
    const py = generatePython(prog);
    expect(py).toContain('np.sqrt');
    expect(py).toContain('np.clip');
    expect(py).toContain('np.abs');
  });

  it('TestPython_Logic_UsesAndOr', () => {
    const prog = IR.program([
      IR.declareVar('x', 'bool', IR.and(IR.bool(true), IR.bool(false))),
      IR.declareVar('y', 'bool', IR.or(IR.bool(true), IR.bool(false))),
    ], { inputs: [], outputs: [] });
    const py = generatePython(prog);
    expect(py).toContain(' and ');
    expect(py).toContain(' or ');
  });

  it('TestPython_NodeGraphMetadata_PreservedAsComment', () => {
    const prog = IR.program([], {
      metadata: { sourceType: 'node_graph', nodeGraph: { nodes: [], edges: [] } },
    });
    const py = generatePython(prog);
    expect(py).toContain('# @nodegraph:');
    expect(py).toContain('"nodes":[]');
  });

  it('TestPython_IfStatement_EmitsCorrectSyntax', () => {
    const prog = IR.program([
      IR.ifStmt(IR.bool(true), [
        IR.writeProperty('alive', IR.f32(1)),
      ], [
        IR.writeProperty('alive', IR.f32(0)),
      ]),
    ], { outputs: [{ property: 'alive', scope: 'cell', type: 'f32' }] });
    const py = generatePython(prog);
    expect(py).toContain('if True:');
    expect(py).toContain('else:');
    expect(py).toContain('    self.alive');
  });
});
